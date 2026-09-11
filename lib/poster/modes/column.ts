import { POSTER_HEIGHT, POSTER_WIDTH, type Density, type GrainLevel } from '../types';
import { measureInk, renderGlyphRun, renderGrain, wordNaturalWidth } from '../primitives';
import { METRICS } from '../metrics';

const MARGIN_TOP_RATIO = 0.06;
const MARGIN_BOTTOM_RATIO = 0.075;
const MARGIN_TOP = POSTER_HEIGHT * MARGIN_TOP_RATIO;
const MARGIN_BOTTOM = POSTER_HEIGHT * MARGIN_BOTTOM_RATIO;
const AVAILABLE = POSTER_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

const MARGIN_SIDE_MIN_RATIO = 0.05;
const MARGIN_SIDE_MIN = POSTER_WIDTH * MARGIN_SIDE_MIN_RATIO;

// How wide the column's measure is, as a fraction of canvas width. Density
// controls the measure directly - kegl and block height both follow from it,
// not the other way round.
const COLUMN_WIDTH_RATIO: Record<Density, number> = {
  tight: 0.62,
  regular: 0.46,
  airy: 0.32,
};

// The accent word's ink width, as a multiple of the widest non-accent word's
// *actual* ink width (post height-cap shrink, if any triggered) - not the
// design measure. This keeps the accent proportional to what the base words
// actually rendered at, instead of holding it at the pre-shrink target.
const ACCENT_WIDTH_RATIO = 1.18;

// Interline gap, as a fraction of a line pair's own kegl - see pairStep():
// the step between two lines is driven by the larger of the pair's two font
// sizes, so a line next to the accent gets more breathing room than the
// rhythm between two ordinary lines.
const LINE_GAP_RATIO = 0.35;

const FONT_SHRINK_STEP = 0.95;

export interface ColumnColors {
  readonly ink: string;
  readonly accent: string;
}

export interface RenderColumnInput {
  readonly words: readonly string[];
  readonly density: Density;
  readonly grain: GrainLevel;
  readonly seed: number;
  readonly accentIndex: number | null;
  readonly colors: ColumnColors;
}

interface WordInk {
  readonly inkMeasureEm: number;
  readonly leftBearingFirst: number;
  readonly inkTop: number;
  readonly inkBottom: number;
}

interface ColumnRow {
  readonly index: number;
  readonly text: string;
  readonly fontSize: number;
  readonly ink: WordInk;
}

function measureWord(word: string, advances: Readonly<Record<string, number>>): WordInk {
  const chars = Array.from(word);
  const naturalWidth = wordNaturalWidth(word, advances);
  return measureInk(chars, naturalWidth, advances, '800');
}

/** The candidate with the widest ink among the given word indices. */
function widestInk(inks: readonly WordInk[], candidateIndices: readonly number[]): WordInk {
  let widest = inks[candidateIndices[0]];
  for (const i of candidateIndices) {
    if (inks[i].inkMeasureEm > widest.inkMeasureEm) widest = inks[i];
  }
  return widest;
}

/**
 * Solves the accent kegl so its ink width equals `actualBaseWidthPx *
 * ACCENT_WIDTH_RATIO` - the widest non-accent word's actual painted width at
 * the current base kegl, not the design measure - unless that would push the
 * right edge of its ink past `1080 - MARGIN_SIDE_MIN`, in which case the
 * target width is clamped to exactly that edge instead. Ink width scales
 * linearly with font size, so clamping the target width directly lands the
 * edge on the limit with no cropping and no search.
 */
function solveAccentFontSize(ink: WordInk, actualBaseWidthPx: number, leftEdge: number): number {
  const availableWidth = POSTER_WIDTH - MARGIN_SIDE_MIN - leftEdge;
  const targetWidth = Math.min(actualBaseWidthPx * ACCENT_WIDTH_RATIO, availableWidth);
  return (targetWidth * 1000) / ink.inkMeasureEm;
}

/**
 * Baseline-to-baseline step for one line pair, driven by the larger of the
 * two lines' own kegl - a line sitting next to the accent gets a bigger gap
 * on that side, rather than the whole column following a single fixed step.
 */
function pairStep(fontSizeA: number, fontSizeB: number, capHeight: number): number {
  return Math.max(fontSizeA, fontSizeB) * (capHeight / 1000 + LINE_GAP_RATIO);
}

function computeSteps(rows: readonly ColumnRow[], capHeight: number): number[] {
  const steps: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    steps.push(pairStep(rows[i - 1].fontSize, rows[i].fontSize, capHeight));
  }
  return steps;
}

function naturalHeightOf(rows: readonly ColumnRow[], steps: readonly number[]): number {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const firstAscent = -first.ink.inkTop * (first.fontSize / 1000);
  const lastDescent = last.ink.inkBottom * (last.fontSize / 1000);
  const stepSum = steps.reduce((a, b) => a + b, 0);
  return firstAscent + stepSum + lastDescent;
}

export function renderColumn(input: RenderColumnInput): string {
  const { density, grain, seed, accentIndex, colors } = input;
  const words = input.words.map((w) => w.toUpperCase());
  const metrics = METRICS['800'];
  const measure = COLUMN_WIDTH_RATIO[density] * POSTER_WIDTH;
  const leftEdge = (POSTER_WIDTH - measure) / 2;

  const inks = words.map((w) => measureWord(w, metrics.advances));
  const baseCandidates = words.map((_, i) => i).filter((i) => i !== accentIndex);
  const widestBase = widestInk(inks, baseCandidates);

  function actualBaseWidthPx(fontSize: number): number {
    return (fontSize * widestBase.inkMeasureEm) / 1000;
  }

  let baseFontSize = (measure * 1000) / widestBase.inkMeasureEm;
  let accentFontSize =
    accentIndex !== null ? solveAccentFontSize(inks[accentIndex], actualBaseWidthPx(baseFontSize), leftEdge) : null;

  function buildRows(): ColumnRow[] {
    return words.map((text, i) => ({
      index: i,
      text,
      fontSize: i === accentIndex && accentFontSize !== null ? accentFontSize : baseFontSize,
      ink: inks[i],
    }));
  }

  let rows = buildRows();
  let steps = computeSteps(rows, metrics.capHeight);
  let naturalHeight = naturalHeightOf(rows, steps);

  while (naturalHeight > AVAILABLE) {
    baseFontSize *= FONT_SHRINK_STEP;
    if (accentIndex !== null) {
      accentFontSize = solveAccentFontSize(inks[accentIndex], actualBaseWidthPx(baseFontSize), leftEdge);
    }
    rows = buildRows();
    steps = computeSteps(rows, metrics.capHeight);
    naturalHeight = naturalHeightOf(rows, steps);
  }

  const firstAscent = -rows[0].ink.inkTop * (rows[0].fontSize / 1000);
  const baselines: number[] = [MARGIN_TOP + firstAscent];
  for (let i = 1; i < rows.length; i++) {
    baselines.push(baselines[i - 1] + steps[i - 1]);
  }

  const textParts: string[] = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const baselineY = baselines[ri];
    const scale = row.fontSize / 1000;
    const fill = row.index === accentIndex ? colors.accent : colors.ink;

    const penX = leftEdge - row.ink.leftBearingFirst * scale;
    const run = renderGlyphRun(row.text, penX, baselineY, scale, metrics);
    textParts.push(`<g fill="${fill}">${run.svg}</g>`);
  }

  return renderGrain(grain, seed, colors.ink) + textParts.join('');
}
