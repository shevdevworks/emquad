import { POSTER_HEIGHT, POSTER_WIDTH, type GrainLevel } from './types';
import { getInkBounds } from './glyph-bounds';
import type { FontMetrics } from './metrics';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function wordNaturalWidth(word: string, advances: Readonly<Record<string, number>>): number {
  let width = 0;
  for (const char of word) {
    width += advances[char] ?? 500;
  }
  return width;
}

const GRAIN_COUNT: Record<GrainLevel, number> = {
  0: 0,
  1: 200,
  2: 450,
  3: 900,
};

const GRAIN_CELL_MIN = 5;
const GRAIN_CELL_MAX = 14;
const GRAIN_OPACITY_MIN = 0.06;
const GRAIN_OPACITY_MAX = 0.2;
const GRAIN_OPACITY_BUCKETS = [0.08, 0.12, 0.16, 0.2] as const;
const GRAIN_OPACITY_STEP = 0.04;

function quantizeOpacity(draw: number): number {
  const index = Math.round((draw - GRAIN_OPACITY_BUCKETS[0]) / GRAIN_OPACITY_STEP);
  return GRAIN_OPACITY_BUCKETS[Math.min(GRAIN_OPACITY_BUCKETS.length - 1, Math.max(0, index))];
}

export function renderGrain(grain: GrainLevel, seed: number, ink: string): string {
  const count = GRAIN_COUNT[grain];
  if (count === 0) return '';

  const rng = mulberry32(seed);
  const buckets = new Map<number, string[]>();

  for (let i = 0; i < count; i++) {
    const x = rng() * POSTER_WIDTH;
    const y = rng() * POSTER_HEIGHT;
    const size = GRAIN_CELL_MIN + rng() * (GRAIN_CELL_MAX - GRAIN_CELL_MIN);
    const opacityDraw = GRAIN_OPACITY_MIN + rng() * (GRAIN_OPACITY_MAX - GRAIN_OPACITY_MIN);
    const opacity = quantizeOpacity(opacityDraw);

    const cell = `M${x.toFixed(1)},${y.toFixed(1)}h${size.toFixed(1)}v${size.toFixed(1)}h${(-size).toFixed(1)}z`;
    const bucket = buckets.get(opacity);
    if (bucket === undefined) {
      buckets.set(opacity, [cell]);
    } else {
      bucket.push(cell);
    }
  }

  const parts: string[] = [];
  for (const opacity of GRAIN_OPACITY_BUCKETS) {
    const cells = buckets.get(opacity);
    if (cells === undefined) continue;
    parts.push(`<path d="${cells.join('')}" fill="${ink}" fill-opacity="${opacity}"/>`);
  }
  return parts.join('');
}

export function glyphPath(path: string | undefined, penX: number, baselineY: number, scale: number): string {
  if (path === undefined) return '';
  return `<path d="${path}" transform="translate(${penX.toFixed(2)} ${baselineY.toFixed(2)}) scale(${scale.toFixed(6)})"/>`;
}

export interface GlyphRun {
  /** Concatenated <path> elements, with no wrapping <g> - the caller owns fill and grouping. */
  readonly svg: string;
  /** Pen position after the run's last advance, for callers that keep writing on the same baseline. */
  readonly penX: number;
}

/**
 * Sets one space-free run of characters on a single baseline: advance the pen
 * per character, emit one path per glyph that has one. Mechanics only - where
 * the run starts, what color it takes, whether it gets wrapped in a <g>, and
 * what happens between words are all the mode's own business.
 */
export function renderGlyphRun(
  text: string,
  penX: number,
  baselineY: number,
  scale: number,
  metrics: FontMetrics,
): GlyphRun {
  const parts: string[] = [];
  let pen = penX;
  for (const char of text) {
    parts.push(glyphPath(metrics.paths[char], pen, baselineY, scale));
    pen += (metrics.advances[char] ?? 500) * scale;
  }
  return { svg: parts.join(''), penX: pen };
}

export interface InkMeasure {
  /** Painted-ink width of the char span, in per-mille of em. */
  readonly inkMeasureEm: number;
  /** Ink-space left bearing of the span's first glyph, in per-mille of em. */
  readonly leftBearingFirst: number;
  /** Topmost ink Y across every glyph in the span, in per-mille of em. */
  readonly inkTop: number;
  /** Bottommost ink Y across every glyph in the span, in per-mille of em. */
  readonly inkBottom: number;
}

/**
 * Ink-bearing correction for a flat, space-free span of characters (a single
 * word, or several words already joined into one natural-width figure by the
 * caller): corrects `naturalWidth` for left/right side-bearing so painted ink
 * - not raw advance - is what gets fit to a target width, and scans every
 * char in the span for vertical ink extent (letterform overshoot can land on
 * any character, not just the first/last).
 */
export function measureInk(
  chars: readonly string[],
  naturalWidth: number,
  advances: Readonly<Record<string, number>>,
  weight: '500' | '800',
): InkMeasure {
  const firstChar = chars[0];
  const lastChar = chars[chars.length - 1];
  const firstBounds = getInkBounds(weight, firstChar);
  const lastBounds = getInkBounds(weight, lastChar);
  const leftBearingFirst = firstBounds.x0;
  const rightBearingLast = (advances[lastChar] ?? 500) - lastBounds.x1;
  const inkMeasureEm = naturalWidth - leftBearingFirst - rightBearingLast;

  let inkTop = Infinity;
  let inkBottom = -Infinity;
  for (const char of chars) {
    const bounds = getInkBounds(weight, char);
    if (bounds.y0 < inkTop) inkTop = bounds.y0;
    if (bounds.y1 > inkBottom) inkBottom = bounds.y1;
  }

  return { inkMeasureEm, leftBearingFirst, inkTop, inkBottom };
}
