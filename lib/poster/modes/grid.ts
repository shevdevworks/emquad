import { POSTER_HEIGHT, POSTER_WIDTH, type Density, type GrainLevel } from '../types';
import { glyphPath, measureInk, mulberry32, renderGrain, wordNaturalWidth, type InkMeasure } from '../primitives';
import onestGlyphs from '../onest-glyphs.json';

interface FontMetrics {
  readonly unitsPerEm: number;
  readonly capHeight: number;
  readonly ascender: number;
  readonly descender: number;
  readonly advances: Readonly<Record<string, number>>;
  readonly paths: Readonly<Record<string, string>>;
}

// Same widening as modes/stack.ts and modes/break.ts - see stack.ts for the
// full explanation. Duplicated here on purpose: this mode does not import
// from stack.ts or break.ts.
const METRICS = onestGlyphs as unknown as Record<'500' | '800', FontMetrics>;

export const COLS = 4;
export const CELL = POSTER_WIDTH / COLS;
export const ROWS = POSTER_HEIGHT / CELL;

// Inset from a word's own module edge to its ink, on every side. Fixed
// across densities: at 16-44px it is too small relative to the 270px module
// step to ever push a word across a cell boundary on its own, so density
// must carry its effect through maxSpan instead (see DENSITY_METRICS).
export const PADDING = 28;

// maxSpan: hard ceiling on how many modules a single word may occupy -
// this is density's real lever now (padding alone can't move the needle at
// a 270px module step). fillFraction: share of free (non-word,
// non-knockout) modules that become decorative fills, subject to
// fillCapModules (see the fill-placement loop in renderGrid).
export const DENSITY_METRICS: Record<Density, { maxSpan: number; fillFraction: number; fillCapModules: number }> = {
  tight: { maxSpan: 4, fillFraction: 0.55, fillCapModules: 8 },
  regular: { maxSpan: 3, fillFraction: 0.35, fillCapModules: 6 },
  airy: { maxSpan: 2, fillFraction: 0.18, fillCapModules: 3 },
};

// Lower bound of the kegl search: below this the grid reads as a caption
// grid, not a typographic module.
const MIN_FONT_SIZE = 40;
// Upper bracket for the search - generously above anything that could ever
// fit a 270px cell (row ink height alone rules it out well before the
// span/width constraint would), so the true maximum always lies inside
// [MIN_FONT_SIZE, SEARCH_HI_START].
const SEARCH_HI_START = 2000;
// Fixed iteration count, not an epsilon: keeps the search fully
// deterministic, independent of seed.
const SEARCH_ITERATIONS = 40;

export interface GridColors {
  readonly ink: string;
  readonly accent: string;
  readonly paper: string;
}

export interface RenderGridInput {
  readonly words: readonly string[];
  readonly density: Density;
  readonly grain: GrainLevel;
  readonly seed: number;
  readonly accentIndex: number | null;
  readonly colors: GridColors;
}

function measureWord(word: string, advances: Readonly<Record<string, number>>): InkMeasure {
  return measureInk(Array.from(word), wordNaturalWidth(word, advances), advances, '800');
}

/** Painted width (em-based, via measureInk) turned into a module span - a span above the density's maxSpan is a caller-checked infeasibility, not clamped away. */
function computeSpan(inkMeasureEm: number, scale: number): number {
  return Math.ceil((inkMeasureEm * scale + 2 * PADDING) / CELL);
}

/**
 * Sequential greedy row packing: a word joins the current row if its span
 * fits the remaining columns, else it starts a new row. Assumes every span
 * is already <= COLS - a span that big on its own would never fit any row,
 * and callers check that separately before packing.
 */
function packRows(spans: readonly number[]): number[][] {
  const rows: number[][] = [];
  let current: number[] = [];
  let used = 0;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (current.length > 0 && used + span > COLS) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push(i);
    used += span;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

interface FeasibleResult {
  readonly ok: boolean;
  readonly rows: readonly number[][];
}

/**
 * Binary-search predicate for the kegl (one font size shared by every
 * word). Monotonic in fontSize: both the span-driven row count and each
 * row's combined ink height only grow as fontSize grows, so a single
 * bisection finds the maximum feasible size.
 */
function evaluate(measures: readonly InkMeasure[], maxSpan: number, fontSize: number): FeasibleResult {
  const scale = fontSize / 1000;
  const spans = measures.map((m) => computeSpan(m.inkMeasureEm, scale));
  if (spans.some((s) => s > maxSpan)) return { ok: false, rows: [] };

  const rows = packRows(spans);
  const wordRowCount = rows.length;
  // An empty row is spliced between word rows only when there is an
  // interior gap to put it in (>=2 word rows) and room left to add one
  // (<=4 word rows) - see the "single word-row" note in renderGrid.
  const totalRows = wordRowCount + (wordRowCount >= 2 && wordRowCount <= 4 ? 1 : 0);
  if (totalRows > ROWS) return { ok: false, rows: [] };

  // Rows share one baseline (see renderGrid), so it is each row's combined
  // ink extent - not any single word's own height - that must fit the band.
  for (const row of rows) {
    const top = Math.min(...row.map((i) => measures[i].inkTop));
    const bottom = Math.max(...row.map((i) => measures[i].inkBottom));
    if ((bottom - top) * scale > CELL - 2 * PADDING) return { ok: false, rows: [] };
  }

  return { ok: true, rows };
}

interface PlacedWord {
  readonly index: number;
  readonly colStart: number;
  readonly span: number;
}

interface RowLayout {
  readonly physicalRow: number;
  readonly baselineY: number;
  readonly words: readonly PlacedWord[];
}

type FillShape = '2x1' | '1x2' | '2x2';
const FILL_SHAPES: readonly FillShape[] = ['2x1', '1x2', '2x2'];

interface GridCell {
  readonly r: number;
  readonly c: number;
}

function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

export function renderGrid(input: RenderGridInput): string {
  const { density, grain, seed, accentIndex, colors } = input;
  const words = input.words.map((w) => w.toUpperCase());
  const { maxSpan, fillFraction, fillCapModules } = DENSITY_METRICS[density];
  const padding = PADDING;
  const metrics = METRICS['800'];
  const advances = metrics.advances;

  const measures = words.map((w) => measureWord(w, advances));

  const lowResult = evaluate(measures, maxSpan, MIN_FONT_SIZE);
  if (!lowResult.ok) {
    throw new Error(
      `renderGrid: "${words.join(' ')}" does not fit a ${COLS}x${ROWS} grid at "${density}" density (maxSpan ${maxSpan}) even at the minimum font size (${MIN_FONT_SIZE})`,
    );
  }

  let lo = MIN_FONT_SIZE;
  let loResult = lowResult;
  let hi = SEARCH_HI_START;
  for (let i = 0; i < SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const midResult = evaluate(measures, maxSpan, mid);
    if (midResult.ok) {
      lo = mid;
      loResult = midResult;
    } else {
      hi = mid;
    }
  }

  const fontSize = lo;
  const scale = fontSize / 1000;
  const wordRows = loResult.rows;
  const wordRowCount = wordRows.length;

  const rng = mulberry32(seed);

  // No interior gap exists with a single word row, so nothing is inserted -
  // the row simply sits at physical row 0 and the rest of the grid is
  // ordinary free space.
  let gapIndex: number | null = null;
  if (wordRowCount >= 2 && wordRowCount <= 4) {
    gapIndex = Math.floor(rng() * (wordRowCount - 1));
  }

  const rowLayouts: RowLayout[] = wordRows.map((row, wordRowIdx) => {
    const physicalRow = gapIndex !== null && wordRowIdx > gapIndex ? wordRowIdx + 1 : wordRowIdx;

    let col = 0;
    const placedWords: PlacedWord[] = row.map((i) => {
      const span = computeSpan(measures[i].inkMeasureEm, scale);
      const colStart = col;
      col += span;
      return { index: i, colStart, span };
    });

    // One shared baseline per row: independent per-word centering would let
    // round-letter overshoot put neighbors visibly out of line.
    const top = Math.min(...row.map((i) => measures[i].inkTop));
    const bottom = Math.max(...row.map((i) => measures[i].inkBottom));
    const bandTop = physicalRow * CELL;
    const baselineY = bandTop + CELL / 2 - ((top + bottom) / 2) * scale;

    return { physicalRow, baselineY, words: placedWords };
  });

  let knockout: { physicalRow: number; colStart: number; span: number } | null = null;
  if (accentIndex !== null) {
    for (const row of rowLayouts) {
      const word = row.words.find((w) => w.index === accentIndex);
      if (word !== undefined) {
        knockout = { physicalRow: row.physicalRow, colStart: word.colStart, span: word.span };
        break;
      }
    }
  }

  const occupied = new Set<string>();
  for (const row of rowLayouts) {
    for (const word of row.words) {
      for (let c = word.colStart; c < word.colStart + word.span; c++) {
        occupied.add(cellKey(row.physicalRow, c));
      }
    }
  }

  const freeCells: GridCell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!occupied.has(cellKey(r, c))) freeCells.push({ r, c });
    }
  }

  const targetCount = freeCells.length === 0 ? 0 : Math.max(1, Math.floor(freeCells.length * fillFraction));

  const claimed = new Set<string>();
  function isFree(r: number, c: number): boolean {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS && !occupied.has(cellKey(r, c)) && !claimed.has(cellKey(r, c));
  }

  function shapeCells(cell: GridCell, shape: FillShape): GridCell[] | null {
    const { r, c } = cell;
    if (shape === '2x1') return isFree(r, c + 1) ? [{ r, c }, { r, c: c + 1 }] : null;
    if (shape === '1x2') return isFree(r + 1, c) ? [{ r, c }, { r: r + 1, c }] : null;
    return isFree(r, c + 1) && isFree(r + 1, c) && isFree(r + 1, c + 1)
      ? [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }]
      : null;
  }

  function placeAt(cell: GridCell): GridCell[] {
    const draw = rng();
    const primary: FillShape = draw < 1 / 3 ? '2x1' : draw < 2 / 3 ? '1x2' : '2x2';
    const order = [primary, ...FILL_SHAPES.filter((s) => s !== primary)];
    for (const shape of order) {
      const cells = shapeCells(cell, shape);
      if (cells !== null) return cells;
    }
    return [cell];
  }

  function isGrowable(cell: GridCell): boolean {
    return isFree(cell.r, cell.c + 1) || isFree(cell.r + 1, cell.c);
  }

  // Traversal order is a seeded shuffle, not row-major: row-major would bias
  // every seed toward the same top-left cells and barely vary the picture.
  const shuffled = shuffle(freeCells, rng);

  // The >=2-module fill is guaranteed constructively: the first growable
  // cell in the shuffled order is placed first, and placeAt only degrades to
  // a bare 1x1 after failing every shape - which cannot happen for a cell
  // known to be growable. Only when no free cell anywhere has a free right
  // or down neighbor does the invariant become unsatisfiable.
  const growableFirstIndex = shuffled.findIndex(isGrowable);
  const placementOrder =
    growableFirstIndex === -1
      ? shuffled
      : [shuffled[growableFirstIndex], ...shuffled.filter((_, i) => i !== growableFirstIndex)];

  // fillCapModules bounds the *area* claimed, independent of targetCount:
  // targetCount alone is unbounded (a share of however many cells happen to
  // be free), which at a small kegl can flood most of the canvas red. The
  // >=2-module guarantee still has priority over the cap - the very first
  // placement always proceeds even if it would push area at/over the cap;
  // every placement after that stops as soon as the accumulated area has
  // already reached it.
  const fillCellGroups: GridCell[][] = [];
  let fillAreaModules = 0;
  for (const cell of placementOrder) {
    if (!isFree(cell.r, cell.c)) continue;

    const isFirstFill = fillCellGroups.length === 0;
    if (!isFirstFill) {
      if (fillCellGroups.length >= targetCount) break;
      if (fillAreaModules >= fillCapModules) break;
    }

    const cells = placeAt(cell);
    for (const claimedCell of cells) claimed.add(cellKey(claimedCell.r, claimedCell.c));
    fillCellGroups.push(cells);
    fillAreaModules += cells.length;
  }

  function boundingRect(cells: readonly GridCell[]): { x: number; y: number; width: number; height: number } {
    const minR = Math.min(...cells.map((c) => c.r));
    const maxR = Math.max(...cells.map((c) => c.r));
    const minC = Math.min(...cells.map((c) => c.c));
    const maxC = Math.max(...cells.map((c) => c.c));
    return { x: minC * CELL, y: minR * CELL, width: (maxC - minC + 1) * CELL, height: (maxR - minR + 1) * CELL };
  }

  // Knockout rect is emitted first (before any fill) so the lab checker can
  // identify it purely by position: rects[0] iff accentIndex !== null.
  const knockoutSvg =
    knockout !== null
      ? `<rect x="${knockout.colStart * CELL}" y="${knockout.physicalRow * CELL}" width="${knockout.span * CELL}" height="${CELL}" fill="${colors.accent}"/>`
      : '';

  const fillsSvg = fillCellGroups
    .map(boundingRect)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${colors.accent}"/>`)
    .join('');

  const wordGroups = rowLayouts
    .map((row) =>
      row.words
        .map((word) => {
          const text = words[word.index];
          const measure = measures[word.index];
          // The accented word is knocked out: its glyphs follow the
          // background, not the ink color, so the plate reads as a hole.
          const fill = word.index === accentIndex ? colors.paper : colors.ink;

          const glyphParts: string[] = [];
          let penX = word.colStart * CELL + padding - measure.leftBearingFirst * scale;
          for (const char of text) {
            const advance = advances[char] ?? 500;
            const path = metrics.paths[char];
            const rendered = glyphPath(path, penX, row.baselineY, scale);
            if (path !== undefined) glyphParts.push(rendered);
            penX += advance * scale;
          }
          return `<g fill="${fill}">${glyphParts.join('')}</g>`;
        })
        .join(''),
    )
    .join('');

  return renderGrain(grain, seed, colors.ink) + knockoutSvg + fillsSvg + wordGroups;
}
