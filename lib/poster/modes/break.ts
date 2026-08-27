import { POSTER_HEIGHT, POSTER_WIDTH, type Density, type GrainLevel } from '../types';
import { glyphPath, measureInk, mulberry32, renderGrain, wordNaturalWidth } from '../primitives';
import onestGlyphs from '../onest-glyphs.json';

interface FontMetrics {
  readonly unitsPerEm: number;
  readonly capHeight: number;
  readonly ascender: number;
  readonly descender: number;
  readonly advances: Readonly<Record<string, number>>;
  readonly paths: Readonly<Record<string, string>>;
}

// Same widening as modes/stack.ts - see that file for the full explanation.
// Duplicated here on purpose: this mode does not import from stack.ts.
const METRICS = onestGlyphs as unknown as Record<'500' | '800', FontMetrics>;

// The giant's painted ink width, as a multiple of canvas width. 1.25 was
// picked over a larger ratio (e.g. 1.6) because at 1.6 only ~62% of the
// word stays on canvas - a fragment, not a recognizably cropped word. At
// 1.25, ~80% stays visible: the crop reads as deliberate and the word is
// still legible. Kept as its own constant so it can be tuned in one edit.
const GIANT_WIDTH_RATIO = 1.25;
const GIANT_INK_WIDTH_PX = GIANT_WIDTH_RATIO * POSTER_WIDTH;

// Floor on the giant's painted ink width after the height ceiling below is
// applied. Without it, a short word forced via accent can shrink enough to
// fit entirely on canvas - no crop left, which stops being Break. Exported
// so the lab can assert every case actually keeps a crop.
export const GIANT_MIN_WIDTH_RATIO = 1.05;
export const GIANT_MIN_INK_WIDTH_PX = GIANT_MIN_WIDTH_RATIO * POSTER_WIDTH;

const BAND_TOP_RATIO = 0.18;
const BAND_BOTTOM_RATIO = 0.62;
const BAND_TOP = POSTER_HEIGHT * BAND_TOP_RATIO;
const BAND_BOTTOM = POSTER_HEIGHT * BAND_BOTTOM_RATIO;
const BAND_HEIGHT = BAND_BOTTOM - BAND_TOP;

const MARGIN_X: Record<Density, number> = { tight: 64, regular: 96, airy: 140 };
const SMALL_BLOCK_WIDTH_RATIO: Record<Density, number> = { tight: 0.34, regular: 0.28, airy: 0.22 };

// Same numbers as stack.ts's MARGIN_TOP_RATIO/MARGIN_BOTTOM_RATIO - duplicated
// deliberately, stack.ts is not touched for this mode's sake.
const MARGIN_TOP_RATIO = 0.06;
const MARGIN_BOTTOM_RATIO = 0.075;
const MARGIN_TOP = POSTER_HEIGHT * MARGIN_TOP_RATIO;
const MARGIN_BOTTOM = POSTER_HEIGHT * MARGIN_BOTTOM_RATIO;

// The block may shift up to clear the giant's ink, but never past the top
// margin - past that point "compact block in a corner" stops meaning
// anything, so the shrink loop below takes over instead.
const BLOCK_SHIFT_FLOOR_Y = MARGIN_TOP;
const BLOCK_SHRINK_FACTOR = 0.95;
const BLOCK_MAX_SHRINK_STEPS = 6;

// Required clearance between the giant's ink and the small block, not just
// non-overlap - a 0px-touching block reads as stuck to the giant. Exported
// so the lab can assert it directly from the rendered SVG.
export const MIN_GIANT_BLOCK_GAP_PX = 24;

// Gap between the small block's rows, as a fraction of the block's current
// font size ("кегль"). Without it, gap=0 leaves rows visually touching -
// "compact" was meant as dense, not glued together.
const SMALL_BLOCK_LINE_GAP_RATIO = 0.14;

export interface BreakColors {
  readonly ink: string;
  readonly accent: string;
}

export interface RenderBreakInput {
  readonly words: readonly string[];
  readonly density: Density;
  readonly grain: GrainLevel;
  readonly seed: number;
  readonly accentIndex: number | null;
  readonly colors: BreakColors;
}

function wordLength(word: string): number {
  return Array.from(word).length;
}

function longestWordIndex(words: readonly string[]): number {
  let best = 0;
  let bestLength = wordLength(words[0]);
  for (let i = 1; i < words.length; i++) {
    const length = wordLength(words[i]);
    if (length > bestLength) {
      best = i;
      bestLength = length;
    }
  }
  return best;
}

interface WordMeasure {
  /** Painted-ink width of the word, in per-mille of em. */
  readonly inkMeasureEm: number;
  /** Ink-space left bearing of the word's first glyph, in per-mille of em. */
  readonly leftBearingFirst: number;
  /** Topmost ink Y across every glyph in the word, in per-mille of em. */
  readonly inkTop: number;
  /** Bottommost ink Y across every glyph in the word, in per-mille of em. */
  readonly inkBottom: number;
}

/**
 * Same ink-bearing correction as stack.ts's buildRows, applied to a single
 * word instead of a row of words - Break never puts more than one word on
 * a line, so there is no inter-word space to account for.
 */
function measureWord(word: string, advances: Readonly<Record<string, number>>): WordMeasure {
  return measureInk(Array.from(word), wordNaturalWidth(word, advances), advances, '800');
}

interface BlockLayout {
  readonly scale: number;
  readonly blockWidth: number;
  readonly blockInkHeight: number;
  /** Baseline Y of each row, relative to the block's ink top (blockY0). */
  readonly baselineOffsets: readonly number[];
}

export function renderBreak(input: RenderBreakInput): string {
  const { density, grain, seed, accentIndex, colors } = input;
  const words = input.words.map((w) => w.toUpperCase());
  const metrics = METRICS['800'];
  const advances = metrics.advances;
  const marginX = MARGIN_X[density];

  const giantIndex = accentIndex ?? longestWordIndex(words);
  const giantWord = words[giantIndex];
  const giantMeasure = measureWord(giantWord, advances);

  const fontSize0 = (GIANT_INK_WIDTH_PX * 1000) / giantMeasure.inkMeasureEm;
  const scale0 = fontSize0 / 1000;
  const giantInkHeightPx0 = (giantMeasure.inkBottom - giantMeasure.inkTop) * scale0;

  // Height ceiling: closes the degenerate case of a short word (typically
  // forced as giant via accent) whose width-driven font size would paint
  // taller than the 18%-62% band. When it fires, the giant shrinks so its
  // ink height fits the band exactly.
  let fontSize = giantInkHeightPx0 > BAND_HEIGHT ? fontSize0 * (BAND_HEIGHT / giantInkHeightPx0) : fontSize0;
  let scale = fontSize / 1000;
  let actualInkWidthPx = giantMeasure.inkMeasureEm * scale;

  // Width floor: the height ceiling above can narrow a short word enough
  // that it no longer overflows the canvas at all - Break stops being a
  // crop at that point. Never let the ceiling take the giant's width below
  // GIANT_MIN_INK_WIDTH_PX; when it would, keep that width instead and let
  // the ink height exceed the band - the crop matters more than the band.
  if (actualInkWidthPx < GIANT_MIN_INK_WIDTH_PX) {
    fontSize = (GIANT_MIN_INK_WIDTH_PX * 1000) / giantMeasure.inkMeasureEm;
    scale = fontSize / 1000;
    actualInkWidthPx = GIANT_MIN_INK_WIDTH_PX;
  }

  const giantInkHeightPx = (giantMeasure.inkBottom - giantMeasure.inkTop) * scale;

  const rng = mulberry32(seed);
  const bandDraw = rng();
  const cornerDraw = rng();

  // Crop the right edge (word pinned left) by default - cropping the start
  // of a word instead reads as unreadable more often, since the eye
  // reconstructs a word from its beginning, not its end ("FOREVER" cropped
  // to "REVER" doesn't read as "forever"). Cropping the start is kept as an
  // occasional accent, not a coin flip: only 1 seed value in 4.
  const cropRight = Math.abs(seed) % 4 !== 0;
  const giantX0 = cropRight ? marginX : POSTER_WIDTH - marginX - actualInkWidthPx;
  const giantPenX = giantX0 - giantMeasure.leftBearingFirst * scale;

  const slack = Math.max(0, BAND_HEIGHT - giantInkHeightPx);
  const giantInkTopY = BAND_TOP + bandDraw * slack;
  const giantBaselineY = giantInkTopY - giantMeasure.inkTop * scale;

  const giantAABB = {
    x0: giantX0,
    y0: giantInkTopY,
    x1: giantX0 + actualInkWidthPx,
    y1: giantInkTopY + giantInkHeightPx,
  };

  const giantFill = giantIndex === accentIndex ? colors.accent : colors.ink;
  const giantGlyphParts: string[] = [];
  let giantPen = giantPenX;
  for (const char of giantWord) {
    const advance = advances[char] ?? 500;
    giantGlyphParts.push(glyphPath(metrics.paths[char], giantPen, giantBaselineY, scale));
    giantPen += advance * scale;
  }
  const giantSvg = `<g fill="${giantFill}">${giantGlyphParts.join('')}</g>`;

  const blockIndices = words.map((_, i) => i).filter((i) => i !== giantIndex);
  const blockWords = blockIndices.map((i) => words[i]);
  const blockMeasures = blockWords.map((w) => measureWord(w, advances));
  const widestInkMeasureEm = Math.max(...blockMeasures.map((m) => m.inkMeasureEm));
  const smallBlockFontSize0 = (SMALL_BLOCK_WIDTH_RATIO[density] * POSTER_WIDTH * 1000) / widestInkMeasureEm;

  function computeBlockLayout(blockFontSize: number): BlockLayout {
    const blockScale = blockFontSize / 1000;
    const blockWidth = widestInkMeasureEm * blockScale;
    const rowHeight = (blockFontSize * metrics.capHeight) / 1000;
    const lineGap = blockFontSize * SMALL_BLOCK_LINE_GAP_RATIO;
    const firstAscent = -blockMeasures[0].inkTop * blockScale;
    const lastDescent = blockMeasures[blockMeasures.length - 1].inkBottom * blockScale;
    const blockInkHeight =
      firstAscent + (blockMeasures.length - 1) * (rowHeight + lineGap) + lastDescent;

    const baselineOffsets: number[] = [firstAscent];
    for (let i = 1; i < blockMeasures.length; i++) {
      baselineOffsets.push(baselineOffsets[i - 1] + rowHeight + lineGap);
    }

    return { scale: blockScale, blockWidth, blockInkHeight, baselineOffsets };
  }

  const corner = cornerDraw < 0.5 ? 'bottom-left' : 'bottom-right';

  let finalLayout = computeBlockLayout(smallBlockFontSize0);
  let finalBlockX0 = 0;
  let finalBlockY0 = 0;

  for (let step = 0; step <= BLOCK_MAX_SHRINK_STEPS; step++) {
    const stepFontSize = smallBlockFontSize0 * BLOCK_SHRINK_FACTOR ** step;
    const layout = computeBlockLayout(stepFontSize);
    const blockX0 = corner === 'bottom-left' ? marginX : POSTER_WIDTH - marginX - layout.blockWidth;

    let blockY1 = POSTER_HEIGHT - MARGIN_BOTTOM;
    let blockY0 = blockY1 - layout.blockInkHeight;

    let overlapY = Math.min(giantAABB.y1, blockY1) - Math.max(giantAABB.y0, blockY0);
    // Required shift covers both real overlap and a too-thin gap: overlapY
    // is negative when the boxes are already apart, so this is positive
    // exactly when the current gap (-overlapY) is under MIN_GIANT_BLOCK_GAP_PX.
    const requiredShift = overlapY + MIN_GIANT_BLOCK_GAP_PX;
    if (requiredShift > 0) {
      blockY0 = Math.max(blockY0 - requiredShift, BLOCK_SHIFT_FLOOR_Y);
      blockY1 = blockY0 + layout.blockInkHeight;
      overlapY = Math.min(giantAABB.y1, blockY1) - Math.max(giantAABB.y0, blockY0);
    }

    const overlapX = Math.min(giantAABB.x1, blockX0 + layout.blockWidth) - Math.max(giantAABB.x0, blockX0);
    const intersects = overlapX > 0 && overlapY > -MIN_GIANT_BLOCK_GAP_PX;

    finalLayout = layout;
    finalBlockX0 = blockX0;
    finalBlockY0 = blockY0;

    if (!intersects || step === BLOCK_MAX_SHRINK_STEPS) break;
  }

  const blockGlyphParts: string[] = [];
  for (let row = 0; row < blockIndices.length; row++) {
    const wordIndex = blockIndices[row];
    const word = blockWords[row];
    const measure = blockMeasures[row];
    const baselineY = finalBlockY0 + finalLayout.baselineOffsets[row];
    const fill = wordIndex === accentIndex ? colors.accent : colors.ink;

    const rowGlyphParts: string[] = [];
    let pen = finalBlockX0 - measure.leftBearingFirst * finalLayout.scale;
    for (const char of word) {
      const advance = advances[char] ?? 500;
      rowGlyphParts.push(glyphPath(metrics.paths[char], pen, baselineY, finalLayout.scale));
      pen += advance * finalLayout.scale;
    }
    blockGlyphParts.push(`<g fill="${fill}">${rowGlyphParts.join('')}</g>`);
  }

  return renderGrain(grain, seed, colors.ink) + giantSvg + blockGlyphParts.join('');
}
