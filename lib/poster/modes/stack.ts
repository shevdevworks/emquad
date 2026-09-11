import { POSTER_HEIGHT, POSTER_WIDTH, type Density, type GrainLevel } from '../types';
import { measureInk, renderGlyphRun, renderGrain, wordNaturalWidth } from '../primitives';
import { METRICS } from '../metrics';

// Vertical margins are fixed regardless of density - the asymmetry (top
// tighter than bottom) is a deliberate optical correction, not meant to be
// balanced out.
const MARGIN_TOP_RATIO = 0.06;
const MARGIN_BOTTOM_RATIO = 0.075;
const MARGIN_TOP = POSTER_HEIGHT * MARGIN_TOP_RATIO;
const MARGIN_BOTTOM = POSTER_HEIGHT * MARGIN_BOTTOM_RATIO;
const AVAILABLE = POSTER_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

/** bottomMargin / topMargin, an exact invariant of the block placement formula below. */
export const MARGIN_RATIO = MARGIN_BOTTOM_RATIO / MARGIN_TOP_RATIO;

// gapCapFraction bounds how much of the canvas height a single interline
// gap may grow by, as a share of the whole canvas (not of any row's font
// size - rows in one block can have very different sizes, and gaps must
// stay uniform across the block). It exists to stop short phrases from
// spreading into a sparse ladder of widely separated lines.
const DENSITY_METRICS: Record<Density, { marginX: number; gapCapFraction: number }> = {
  tight: { marginX: 64, gapCapFraction: 0.02 },
  regular: { marginX: 96, gapCapFraction: 0.05 },
  airy: { marginX: 140, gapCapFraction: 0.09 },
};

export interface StackColors {
  readonly ink: string;
  readonly accent: string;
}

export interface RenderStackInput {
  readonly words: readonly string[];
  readonly density: Density;
  readonly grain: GrainLevel;
  readonly seed: number;
  readonly accentIndex: number | null;
  readonly colors: StackColors;
}

/**
 * Splits `widths.length` items into `groupCount` contiguous groups whose
 * summed widths are as close to equal as possible. Deterministic, single
 * left-to-right pass, no randomness: it recomputes the target width for the
 * remaining groups at each step and greedily extends the current group
 * while doing so keeps it closer to that target.
 */
function groupWords(widths: readonly number[], spaceWidth: number, groupCount: number): number[][] {
  if (groupCount >= widths.length) {
    return widths.map((_, i) => [i]);
  }

  const groups: number[][] = [];
  let i = 0;
  let remainingWidth = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * spaceWidth;

  for (let g = 0; g < groupCount; g++) {
    const remainingGroups = groupCount - g;
    if (remainingGroups === 1) {
      groups.push(widths.slice(i).map((_, k) => i + k));
      break;
    }

    const target = remainingWidth / remainingGroups;
    const group = [i];
    let groupWidth = widths[i];
    i++;

    while (i < widths.length) {
      // Reserve at least one word per group still owed after this one -
      // otherwise a greedy run of close-to-target widths can swallow every
      // remaining word, leaving the mandatory last group empty.
      const wordsLeftIfTaken = widths.length - (i + 1);
      if (wordsLeftIfTaken < remainingGroups - 1) break;

      const withNext = groupWidth + spaceWidth + widths[i];
      if (Math.abs(withNext - target) >= Math.abs(groupWidth - target)) break;
      groupWidth = withNext;
      group.push(i);
      i++;
    }

    groups.push(group);
    remainingWidth -= groupWidth + spaceWidth;
  }

  return groups;
}

interface RowWord {
  readonly index: number;
  readonly text: string;
  readonly naturalWidth: number;
}

interface Row {
  readonly words: readonly RowWord[];
  readonly fontSize: number;
  readonly rowHeight: number;
  /** Ink-space left bearing of the row's first glyph, in per-mille of em. */
  readonly leftBearingFirst: number;
  /** Topmost ink Y across every glyph in the row, in per-mille of em. */
  readonly rowInkTop: number;
  /** Bottommost ink Y across every glyph in the row, in per-mille of em. */
  readonly rowInkBottom: number;
}

/**
 * Builds one row per group. `fontSize` is solved so the row's painted ink -
 * from the left edge of the first glyph's ink to the right edge of the last
 * glyph's ink - fills `targetWidth` exactly, rather than the row's raw
 * advance sum (which leaves left/right side-bearings unaccounted for and
 * makes rows drift out of alignment with each other). `rowInkTop`/
 * `rowInkBottom` scan every glyph in the row, not just the first/last,
 * since letterform overshoot (round glyphs like O/S/C/G) can land on any
 * character.
 */
function buildRows(
  groups: readonly number[][],
  words: readonly string[],
  widths: readonly number[],
  spaceWidth: number,
  targetWidth: number,
  capHeight: number,
  advances: Readonly<Record<string, number>>,
): Row[] {
  return groups.map((group) => {
    const rowWords: RowWord[] = group.map((index) => ({
      index,
      text: words[index],
      naturalWidth: widths[index],
    }));
    const rowNaturalWidth =
      rowWords.reduce((sum, w) => sum + w.naturalWidth, 0) + (rowWords.length - 1) * spaceWidth;

    const rowChars = rowWords.flatMap((w) => Array.from(w.text));
    const {
      inkMeasureEm: inkMeasure,
      leftBearingFirst,
      inkTop: rowInkTop,
      inkBottom: rowInkBottom,
    } = measureInk(rowChars, rowNaturalWidth, advances, '800');

    const fontSize = (targetWidth * 1000) / inkMeasure;
    const rowHeight = (fontSize * capHeight) / 1000;

    return { words: rowWords, fontSize, rowHeight, leftBearingFirst, rowInkTop, rowInkBottom };
  });
}

function blockHeightOf(rows: readonly Row[], gap: number): number {
  return rows.reduce((sum, row) => sum + row.rowHeight, 0) + gap * (rows.length - 1);
}

/**
 * Block height measured from the actual ink top of the first row to the
 * actual ink bottom of the last row, not from their nominal capHeight-based
 * row boxes. Interline leading between rows still uses capHeight (normal
 * typographic practice); only the two outer edges - the ones measured
 * against the canvas margins - need to be exact.
 */
function naturalInkHeight(rows: readonly Row[], gap: number): number {
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const firstAscent = -firstRow.rowInkTop * (firstRow.fontSize / 1000);
  const lastDescent = lastRow.rowInkBottom * (lastRow.fontSize / 1000);
  return firstAscent + (blockHeightOf(rows, gap) - firstRow.rowHeight) + lastDescent;
}

function computeBaselines(rows: readonly Row[], blockTop: number, gapEach: number): number[] {
  const firstAscent = -rows[0].rowInkTop * (rows[0].fontSize / 1000);
  const baselines = [blockTop + firstAscent];
  for (let i = 1; i < rows.length; i++) {
    baselines.push(baselines[i - 1] + gapEach + rows[i].rowHeight);
  }
  return baselines;
}

export function renderStack(input: RenderStackInput): string {
  const { density, grain, seed, accentIndex, colors } = input;
  const words = input.words.map((w) => w.toUpperCase());
  const { marginX, gapCapFraction } = DENSITY_METRICS[density];
  const targetWidth = POSTER_WIDTH - 2 * marginX;
  const metrics = METRICS['800'];
  const spaceWidth = metrics.advances[' '] ?? 500;
  const widths = words.map((w) => wordNaturalWidth(w, metrics.advances));

  let bestRows: Row[] | null = null;
  let bestNaturalInk = -Infinity;

  for (let l = 1; l <= words.length; l++) {
    const groups = groupWords(widths, spaceWidth, l);
    const rows = buildRows(groups, words, widths, spaceWidth, targetWidth, metrics.capHeight, metrics.advances);
    const naturalInk = naturalInkHeight(rows, 0);
    if (naturalInk <= AVAILABLE && naturalInk > bestNaturalInk) {
      bestRows = rows;
      bestNaturalInk = naturalInk;
    }
  }

  let rows: Row[];
  let naturalInk: number;

  if (bestRows !== null) {
    rows = bestRows;
    naturalInk = bestNaturalInk;
  } else {
    // Emergency fallback: not even one word per row fits at zero gap. Force
    // one word per row (the tallest, most "stack"-like shape) and scale
    // every row's fontSize/rowHeight down by the same factor so the
    // ink-corrected block height lands exactly on AVAILABLE.
    const groups = groupWords(widths, spaceWidth, words.length);
    const naturalRows = buildRows(groups, words, widths, spaceWidth, targetWidth, metrics.capHeight, metrics.advances);
    const k = AVAILABLE / naturalInkHeight(naturalRows, 0);
    rows = naturalRows.map((row) => ({
      ...row,
      fontSize: row.fontSize * k,
      rowHeight: row.rowHeight * k,
    }));
    naturalInk = naturalInkHeight(rows, 0);
  }

  const gapCount = rows.length - 1;
  const freeSpace = AVAILABLE - naturalInk;
  const maxGapAddition = gapCapFraction * POSTER_HEIGHT;
  const gapEach = gapCount > 0 ? Math.min(freeSpace / gapCount, maxGapAddition) : 0;
  const blockHeight = naturalInk + gapEach * gapCount;
  const leftover = AVAILABLE - blockHeight;
  const blockTop = MARGIN_TOP + leftover * (MARGIN_TOP / (MARGIN_TOP + MARGIN_BOTTOM));
  const baselines = computeBaselines(rows, blockTop, gapEach);

  const textParts: string[] = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const baselineY = baselines[ri];
    const scale = row.fontSize / 1000;

    let penX = marginX - row.leftBearingFirst * scale;
    for (let j = 0; j < row.words.length; j++) {
      const word = row.words[j];
      const fill = word.index === accentIndex ? colors.accent : colors.ink;

      const run = renderGlyphRun(word.text, penX, baselineY, scale, metrics);
      penX = run.penX;
      textParts.push(`<g fill="${fill}">${run.svg}</g>`);

      if (j < row.words.length - 1) {
        penX += spaceWidth * scale;
      }
    }
  }

  return renderGrain(grain, seed, colors.ink) + textParts.join('');
}
