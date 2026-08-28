import { POSTER_HEIGHT, POSTER_WIDTH, type Density, type GrainLevel } from '../types';
import { renderGrain, wordNaturalWidth } from '../primitives';
import onestGlyphs from '../onest-glyphs.json';

// Duplicated here on purpose: this mode does not import from stack.ts,
// break.ts, grid.ts or column.ts.
interface FontMetrics {
  readonly unitsPerEm: number;
  readonly capHeight: number;
  readonly ascender: number;
  readonly descender: number;
  readonly advances: Readonly<Record<string, number>>;
  readonly paths: Readonly<Record<string, string>>;
}

// The JSON import's inferred type has one literal property per glyph, with
// no generic string index signature, so arbitrary-character lookups need a
// wider type. The literal shape is verified by hand against the file's
// contents; this only widens the `advances`/`paths` index, it doesn't change
// any value.
const METRICS = onestGlyphs as unknown as Record<'500' | '800', FontMetrics>;

const CX = POSTER_WIDTH / 2;
const CY = POSTER_HEIGHT / 2;

// Fixed regardless of density - unlike an earlier, reverted attempt at this
// mode, there is no RADIUS_RATIO. Density scales font size instead; the
// radius the ring paints against never moves.
export const OUTER = POSTER_WIDTH / 2 - 54;

// Density sets the top arc's font size directly, as a fraction of OUTER.
export const FS_TO_OUTER: Record<Density, number> = {
  tight: 0.28,
  regular: 0.2,
  airy: 0.14,
};

// Bottom arc's font size, as a multiple of the top arc's.
export const BOTTOM_FS_MULT = 1.35;

// Extra angular step between letter centers, as a fraction of font size, on
// both arcs. Gap-only: the glyph's own centering offset (half its advance)
// is untouched by tracking, only the step to the next letter grows. Absent
// from the original postановка - a genuine gap, not a stylistic choice: with
// zero tracking, adjacent letters are placed mathematically edge-to-edge
// (zero natural gap), which left lab/checks.ts's letter-gap check sitting on
// a floating-point knife-edge with no real margin to check against.
export const TRACKING = 0.04;

export const SPAN_TOP_MAX_DEG = 240;
export const SPAN_BOTTOM_MAX_DEG = 140;
export const SIDE_GAP_MIN_DEG = 18;

const SPAN_TOP_MAX = (SPAN_TOP_MAX_DEG * Math.PI) / 180;
const SPAN_BOTTOM_MAX = (SPAN_BOTTOM_MAX_DEG * Math.PI) / 180;
const SIDE_GAP_MIN = (SIDE_GAP_MIN_DEG * Math.PI) / 180;

const FS_SHRINK_STEP = 0.95;
const MIN_FS = 40;
// Defensive backstop only: with FS_SHRINK_STEP=0.95 and any sane starting
// fsTop, MIN_FS fires long before this many iterations.
const SHRINK_ITERATION_CAP = 1000;

export const DISC_RATIO = 0.5;

export interface RingColors {
  readonly ink: string;
  readonly accent: string;
}

export interface RenderRingInput {
  readonly words: readonly string[];
  readonly density: Density;
  readonly grain: GrainLevel;
  readonly seed: number;
  readonly accentIndex: number | null;
  readonly colors: RingColors;
}

interface RingFit {
  readonly fsTop: number;
  readonly fsBot: number;
  readonly rTop: number;
  readonly rInner: number;
  readonly thetaTop: number;
  readonly thetaBot: number;
}

function polar(t: number, r: number): { x: number; y: number } {
  return { x: CX + r * Math.sin(t), y: CY - r * Math.cos(t) };
}

/**
 * The glyph transform is exactly four functions, in this order: translate to
 * the placement point, rotate to face along the arc, scale to font size,
 * then translate by half the glyph's own advance (in pre-scale, font-unit
 * space) so the rotation pivots around the glyph's mid-width. Nothing else
 * may appear in this attribute - lab/checks.ts matches it with a strict
 * regex of exactly this shape.
 */
function buildRingGlyph(d: string | undefined, t: number, r: number, deg: number, fontSize: number, adv: number): string {
  if (d === undefined) return '';
  const { x, y } = polar(t, r);
  const scale = fontSize / 1000;
  return `<path d="${d}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${deg.toFixed(3)}) scale(${scale.toFixed(6)}) translate(${(-adv / 2).toFixed(2)} 0)"/>`;
}

function buildDiscPath(r: number, fill: string): string {
  const left = (CX - r).toFixed(2);
  const right = (CX + r).toFixed(2);
  const cy = CY.toFixed(2);
  const rr = r.toFixed(2);
  return `<path d="M${left},${cy} A${rr},${rr} 0 1 1 ${right},${cy} A${rr},${rr} 0 1 1 ${left},${cy} Z" fill="${fill}"/>`;
}

/**
 * Shrinks fsTop until both arcs' angular spans, and their combined span
 * (leaving room for two side gaps), fit their ceilings. fsBot and the
 * derived radii/angles are recomputed from fsTop on every iteration - the
 * bottom arc is never shrunk independently, it only follows fsTop through
 * BOTTOM_FS_MULT.
 *
 * Arc length includes one TRACKING gap between every pair of adjacent
 * characters - topCount/bottomCount characters have (count-1) gaps, not
 * count - matching the per-letter step in placeTopArc/placeBottomArc
 * exactly, or the extreme letters end up beyond half the computed span and
 * the side-gap check reads the wrong numbers.
 */
function shrinkToFit(
  fsTopInitial: number,
  aTop: number,
  aBot: number,
  topCount: number,
  bottomCount: number,
  capHeight: number,
): RingFit {
  const c = capHeight / 1000;
  let fsTop = fsTopInitial;

  for (let iterations = 0; iterations < SHRINK_ITERATION_CAP; iterations++) {
    if (fsTop < MIN_FS) {
      throw new Error(`ring: fsTop dropped below MIN_FS (${MIN_FS}px) while shrinking to fit`);
    }

    const fsBot = fsTop * BOTTOM_FS_MULT;
    const rTop = OUTER - c * fsTop;
    const rInner = OUTER - c * fsBot;
    const arcLenTop = (aTop / 1000 + TRACKING * (topCount - 1)) * fsTop;
    const arcLenBot = (aBot / 1000 + TRACKING * (bottomCount - 1)) * fsBot;
    const thetaTop = arcLenTop / rTop;
    const thetaBot = arcLenBot / rInner;

    const fits =
      thetaTop <= SPAN_TOP_MAX && thetaBot <= SPAN_BOTTOM_MAX && thetaTop + thetaBot <= 2 * Math.PI - 2 * SIDE_GAP_MIN;

    if (fits) return { fsTop, fsBot, rTop, rInner, thetaTop, thetaBot };
    fsTop *= FS_SHRINK_STEP;
  }

  throw new Error('ring: shrink-to-fit did not converge within the iteration cap');
}

/** Top arc: letters face outward, angle grows along the string, centered on t=0. */
function placeTopArc(text: string, metrics: FontMetrics, fsTop: number, rTop: number, thetaTop: number): string[] {
  const glyphs: string[] = [];
  let arcBefore = 0;

  for (const ch of text) {
    const adv = metrics.advances[ch] ?? 500;
    const path = metrics.paths[ch];
    const arcCenter = arcBefore + (adv * fsTop) / 2000;
    const t = -thetaTop / 2 + arcCenter / rTop;
    const deg = (t * 180) / Math.PI;

    if (path !== undefined) {
      glyphs.push(buildRingGlyph(path, t, rTop, deg, fsTop, adv));
    }
    arcBefore += (adv / 1000 + TRACKING) * fsTop;
  }

  return glyphs;
}

/**
 * Bottom arc: letters face inward (upright for the viewer), angle decreases
 * along the string, centered on t=PI. The angular step is computed from
 * rInner - the ink's inner (near-center) edge - not from the placement
 * radius OUTER. Stepping from OUTER instead would crowd adjacent letters at
 * the inner radius (roughly 29% of an advance width) until the ink overlaps;
 * lab/checks.ts's check 12 exists specifically to catch that regression.
 */
function placeBottomArc(word: string, metrics: FontMetrics, fsBot: number, rInner: number, thetaBot: number): string[] {
  const glyphs: string[] = [];
  let arcBefore = 0;

  for (const ch of word) {
    const adv = metrics.advances[ch] ?? 500;
    const path = metrics.paths[ch];
    const arcCenter = arcBefore + (adv * fsBot) / 2000;
    const t = Math.PI + thetaBot / 2 - arcCenter / rInner;
    const deg = (t * 180) / Math.PI + 180;

    if (path !== undefined) {
      glyphs.push(buildRingGlyph(path, t, OUTER, deg, fsBot, adv));
    }
    arcBefore += (adv / 1000 + TRACKING) * fsBot;
  }

  return glyphs;
}

export function renderRing(input: RenderRingInput): string {
  const { density, grain, seed, accentIndex, colors } = input;
  const words = input.words.map((w) => w.toUpperCase());

  const bottomIndex = accentIndex ?? words.length - 1;
  const bottomWord = words[bottomIndex];
  const topText = words.filter((_, i) => i !== bottomIndex).join(' ');

  const metrics = METRICS['800'];
  const c = metrics.capHeight / 1000;

  const aTop = wordNaturalWidth(topText, metrics.advances);
  const aBot = wordNaturalWidth(bottomWord, metrics.advances);
  const topCount = Array.from(topText).length;
  const bottomCount = Array.from(bottomWord).length;

  const fsTopInitial = FS_TO_OUTER[density] * OUTER;
  const { fsTop, fsBot, rTop, rInner, thetaTop, thetaBot } = shrinkToFit(
    fsTopInitial,
    aTop,
    aBot,
    topCount,
    bottomCount,
    metrics.capHeight,
  );

  const topGlyphs = placeTopArc(topText, metrics, fsTop, rTop, thetaTop).join('');
  const bottomGlyphs = placeBottomArc(bottomWord, metrics, fsBot, rInner, thetaBot).join('');

  const inner = OUTER - c * Math.max(fsTop, fsBot);
  const rDisc = DISC_RATIO * inner;
  const disc = buildDiscPath(rDisc, colors.accent);

  return (
    renderGrain(grain, seed, colors.ink) +
    disc +
    `<g fill="${colors.ink}">${bottomGlyphs}</g>` +
    `<g fill="${colors.ink}">${topGlyphs}</g>`
  );
}
