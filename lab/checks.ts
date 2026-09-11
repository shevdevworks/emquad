import { POSTER_HEIGHT, POSTER_WIDTH, type Mode } from '../lib/poster/types';
import { getPathInkBounds } from '../lib/poster/glyph-bounds';
import { BOTTOM_FS_MULT, OUTER as RING_OUTER, SIDE_GAP_MIN_DEG as RING_SIDE_GAP_MIN_DEG } from '../lib/poster/modes/ring';
import onestGlyphs from '../lib/poster/onest-glyphs.json';

export interface ExactCheckResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
}

const BANNED_SUBSTRINGS = ['<text', 'font', 'filter', 'blur', 'mask', 'foreignObject', 'Gradient', 'rotate('];
const EXPECTED_SVG_OPEN_TAG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">';

// 'rotate(' is banned for every mode except ring, which is required to use
// a rotate() term in its glyph transform (see modes/ring.ts). The list
// itself stays intact - only the per-call filtering is mode-dependent.
export function checkStructure(svg: string, mode: Mode): ExactCheckResult {
  const violations: string[] = [];
  const banned = mode === 'ring' ? BANNED_SUBSTRINGS.filter((s) => s !== 'rotate(') : BANNED_SUBSTRINGS;

  for (const needle of banned) {
    if (svg.includes(needle)) {
      violations.push(`banned substring found: "${needle}"`);
    }
  }

  const openTagEnd = svg.indexOf('>');
  const openTag = openTagEnd === -1 ? svg : svg.slice(0, openTagEnd + 1);
  if (openTag !== EXPECTED_SVG_OPEN_TAG) {
    violations.push(`root svg tag mismatch: expected ${JSON.stringify(EXPECTED_SVG_OPEN_TAG)}, got ${JSON.stringify(openTag)}`);
  }

  return { ok: violations.length === 0, violations };
}

export function checkDeterminism(svgA: string, svgB: string): ExactCheckResult {
  const violations = svgA === svgB ? [] : ['render(spec) produced different output across two calls with the same spec'];
  return { ok: violations.length === 0, violations };
}

export function checkParserSync(svg: string, pathMatchCount: number): ExactCheckResult {
  const violations: string[] = [];
  if (svg.includes('<path') && pathMatchCount === 0) {
    violations.push('svg contains "<path" but the glyph-path regex matched 0 elements — checks.ts parsing is out of sync with the render output format');
  }
  return { ok: violations.length === 0, violations };
}

interface GlyphSpan {
  readonly rowKey: string;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly scale: number;
}

// Matches modes/stack.ts's exact emitted format for a glyph path element.
// Grain <rect> elements have no `transform` attribute, so they structurally
// never match this — no separate exclusion needed anywhere below.
const PATH_RE = /<path d="([^"]*)" transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)"\/>/g;

function parseGlyphs(svg: string): GlyphSpan[] {
  const spans: GlyphSpan[] = [];
  for (const match of svg.matchAll(PATH_RE)) {
    const [, d, txStr, tyStr, scaleStr] = match;
    const tx = Number(txStr);
    const ty = Number(tyStr);
    const scale = Number(scaleStr);
    const bounds = getPathInkBounds(d);
    spans.push({
      rowKey: tyStr,
      x0: tx + bounds.x0 * scale,
      x1: tx + bounds.x1 * scale,
      y0: ty + bounds.y0 * scale,
      y1: ty + bounds.y1 * scale,
      scale,
    });
  }
  return spans;
}

export function countGlyphPaths(svg: string): number {
  return Array.from(svg.matchAll(PATH_RE)).length;
}

export interface RowSpan {
  readonly key: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  /** Glyph scale shared by every glyph in the row (rows are built at one font size). */
  readonly scale: number;
}

export function collectRows(svg: string): RowSpan[] {
  const rows = new Map<string, { minX: number; maxX: number; minY: number; maxY: number; scale: number }>();
  for (const s of parseGlyphs(svg)) {
    const row = rows.get(s.rowKey);
    if (row === undefined) {
      rows.set(s.rowKey, { minX: s.x0, maxX: s.x1, minY: s.y0, maxY: s.y1, scale: s.scale });
    } else {
      if (s.x0 < row.minX) row.minX = s.x0;
      if (s.x1 > row.maxX) row.maxX = s.x1;
      if (s.y0 < row.minY) row.minY = s.y0;
      if (s.y1 > row.maxY) row.maxY = s.y1;
    }
  }
  return Array.from(rows.entries()).map(([key, r]) => ({ key, ...r }));
}

/**
 * Splits rows into the Break giant (the row with the largest glyph scale -
 * a giant word is always painted far larger than the small block's words)
 * and the remaining "block" rows. Independent of break.ts's internal state:
 * derived purely from the rendered SVG, like every other check here.
 */
export function splitGiantRow(rows: readonly RowSpan[]): { giant: RowSpan | null; blockRows: RowSpan[] } {
  if (rows.length === 0) return { giant: null, blockRows: [] };
  let giant = rows[0];
  for (const row of rows) {
    if (row.scale > giant.scale) giant = row;
  }
  return { giant, blockRows: rows.filter((row) => row !== giant) };
}

/**
 * Signed vertical gap between the Break giant and the small block's
 * combined ink bounds. Positive when they don't overlap, negative (the
 * overlap depth) when they do - `ok` is the only field callers need for a
 * pass/fail read. `minGapPx` (default 0) raises the bar from "not
 * overlapping" to "at least this many px apart" - break.ts's own
 * MIN_GIANT_BLOCK_GAP_PX for Break cases.
 */
export function checkGiantBlockGap(rows: readonly RowSpan[], minGapPx = 0): { gapPx: number; ok: boolean } {
  const { giant, blockRows } = splitGiantRow(rows);
  if (giant === null || blockRows.length === 0) {
    return { gapPx: 0, ok: true };
  }

  const blockMinY = Math.min(...blockRows.map((r) => r.minY));
  const blockMaxY = Math.max(...blockRows.map((r) => r.maxY));

  const gapPx =
    giant.maxY <= blockMinY
      ? blockMinY - giant.maxY
      : blockMaxY <= giant.minY
        ? giant.minY - blockMaxY
        : -(Math.min(giant.maxY, blockMaxY) - Math.max(giant.minY, blockMinY));

  return { gapPx, ok: gapPx >= minGapPx };
}

/**
 * Smallest vertical gap between any two vertically-adjacent rows within a
 * set of rows (meant for Break's block rows, giant excluded via
 * splitGiantRow) - catches rows that visually touch or overlap even though
 * each individually looks fine.
 */
export function checkBlockLineSpacing(blockRows: readonly RowSpan[]): { minGapPx: number; ok: boolean } {
  if (blockRows.length < 2) {
    return { minGapPx: Infinity, ok: true };
  }

  const sorted = blockRows.slice().sort((a, b) => a.minY - b.minY);
  let minGapPx = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].minY - sorted[i - 1].maxY;
    if (gap < minGapPx) minGapPx = gap;
  }

  return { minGapPx, ok: minGapPx > 0 };
}

/**
 * Break's giant must keep a painted ink width of at least `minWidthPx`
 * (break.ts's GIANT_MIN_INK_WIDTH_PX) even after its height ceiling fires -
 * otherwise a short accent-forced word can shrink small enough to fit the
 * canvas with no crop left at all.
 */
export function checkGiantMinWidth(rows: readonly RowSpan[], minWidthPx: number): { widthPx: number; ok: boolean } {
  const { giant } = splitGiantRow(rows);
  if (giant === null) {
    return { widthPx: 0, ok: true };
  }
  const widthPx = giant.maxX - giant.minX;
  return { widthPx, ok: widthPx >= minWidthPx };
}

export interface ToleranceMetric {
  readonly label: string;
  readonly value: number;
  readonly thresholdPercent: number;
  readonly ok: boolean;
  readonly note?: string;
}

export function checkEdgeConvergence(
  rows: readonly RowSpan[],
  thresholdPercent: number,
): { left: ToleranceMetric; right: ToleranceMetric } {
  if (rows.length <= 1) {
    return {
      left: { label: 'left-edge convergence', value: 0, thresholdPercent, ok: true, note: 'n/a (single row)' },
      right: { label: 'right-edge convergence', value: 0, thresholdPercent, ok: true, note: 'n/a (single row)' },
    };
  }

  const lefts = rows.map((r) => r.minX);
  const rights = rows.map((r) => r.maxX);
  const leftSpread = Math.max(...lefts) - Math.min(...lefts);
  const rightSpread = Math.max(...rights) - Math.min(...rights);
  const thresholdPx = (thresholdPercent / 100) * POSTER_WIDTH;

  return {
    left: { label: 'left-edge convergence', value: leftSpread, thresholdPercent, ok: leftSpread <= thresholdPx },
    right: { label: 'right-edge convergence', value: rightSpread, thresholdPercent, ok: rightSpread <= thresholdPx },
  };
}

export interface VerticalMarginsResult {
  readonly topMarginPx: number;
  readonly bottomMarginPx: number;
  /** bottomMarginPx - topMarginPx, signed. */
  readonly signedDiffPx: number;
  /** bottomMarginPx / topMarginPx, or null when topMarginPx is ~0. */
  readonly ratio: number | null;
  readonly metric: ToleranceMetric;
}

/**
 * Checks the ratio of bottom to top margin against `expectedRatio`, not
 * their absolute difference. Stack's block placement is deliberately
 * asymmetric (top margin tighter than bottom, a fixed 6:7.5 ratio by
 * construction - see modes/stack.ts's MARGIN_RATIO) and that ratio holds
 * exactly regardless of how much leftover vertical space a run has, so a
 * symmetry check flags every case where the interline gap cap absorbs a lot
 * of leftover space as a false failure. `expectedRatio: null` runs the
 * measurement in diagnostic-only mode (no assertion) - used for Break,
 * which has no such invariant to check.
 */
export function checkVerticalMargins(
  svg: string,
  expectedRatio: number | null,
  thresholdPercent: number,
): VerticalMarginsResult {
  const spans = parseGlyphs(svg);
  if (spans.length === 0) {
    return {
      topMarginPx: 0,
      bottomMarginPx: 0,
      signedDiffPx: 0,
      ratio: null,
      metric: { label: 'vertical margins', value: 0, thresholdPercent, ok: true, note: 'n/a (no glyphs)' },
    };
  }

  const minY = Math.min(...spans.map((s) => s.y0));
  const maxY = Math.max(...spans.map((s) => s.y1));
  const topMarginPx = minY;
  const bottomMarginPx = POSTER_HEIGHT - maxY;
  const signedDiffPx = bottomMarginPx - topMarginPx;
  const ratio = topMarginPx > 0 ? bottomMarginPx / topMarginPx : null;

  if (expectedRatio === null || ratio === null) {
    return {
      topMarginPx,
      bottomMarginPx,
      signedDiffPx,
      ratio,
      metric: {
        label: 'vertical margins',
        value: 0,
        thresholdPercent,
        ok: true,
        note: expectedRatio === null ? 'n/a (diagnostic only)' : 'n/a (top margin is zero)',
      },
    };
  }

  const deviationPercent = (Math.abs(ratio - expectedRatio) / expectedRatio) * 100;

  return {
    topMarginPx,
    bottomMarginPx,
    signedDiffPx,
    ratio,
    metric: { label: 'vertical margins', value: deviationPercent, thresholdPercent, ok: deviationPercent <= thresholdPercent },
  };
}

export interface BleedResult {
  readonly violationCount: number;
  readonly maxOverflowPx: number;
  readonly overflowLeftPx: number;
  readonly overflowRightPx: number;
  readonly overflowTopPx: number;
  readonly overflowBottomPx: number;
  readonly ok: boolean;
}

export function checkBleed(svg: string, allowBleed: boolean): BleedResult {
  const spans = parseGlyphs(svg);
  let violationCount = 0;
  let maxOverflowPx = 0;
  let overflowLeftPx = 0;
  let overflowRightPx = 0;
  let overflowTopPx = 0;
  let overflowBottomPx = 0;

  for (const s of spans) {
    const left = Math.max(0 - s.x0, 0);
    const right = Math.max(s.x1 - POSTER_WIDTH, 0);
    const top = Math.max(0 - s.y0, 0);
    const bottom = Math.max(s.y1 - POSTER_HEIGHT, 0);
    const overflow = Math.max(left, right, top, bottom);

    if (overflow > 0) violationCount++;
    if (overflow > maxOverflowPx) maxOverflowPx = overflow;
    if (left > overflowLeftPx) overflowLeftPx = left;
    if (right > overflowRightPx) overflowRightPx = right;
    if (top > overflowTopPx) overflowTopPx = top;
    if (bottom > overflowBottomPx) overflowBottomPx = bottom;
  }

  return {
    violationCount,
    maxOverflowPx,
    overflowLeftPx,
    overflowRightPx,
    overflowTopPx,
    overflowBottomPx,
    ok: allowBleed || violationCount === 0,
  };
}

export interface SingleSidedBleedResult {
  readonly ok: boolean;
  readonly side: 'left' | 'right' | 'none';
  readonly overflowPx: number;
}

/**
 * Break's crop is only supposed to touch one horizontal edge - never both,
 * never top/bottom. `ok` requires exactly that: zero vertical overflow, and
 * at most one horizontal side overflowing.
 */
export function checkSingleSidedHorizontalBleed(bleed: BleedResult): SingleSidedBleedResult {
  const hasLeft = bleed.overflowLeftPx > 0;
  const hasRight = bleed.overflowRightPx > 0;
  const hasVertical = bleed.overflowTopPx > 0 || bleed.overflowBottomPx > 0;

  if (!hasLeft && !hasRight) {
    return { ok: !hasVertical, side: 'none', overflowPx: 0 };
  }
  if (hasLeft && hasRight) {
    return { ok: false, side: 'left', overflowPx: Math.max(bleed.overflowLeftPx, bleed.overflowRightPx) };
  }

  const side = hasLeft ? 'left' : 'right';
  const overflowPx = hasLeft ? bleed.overflowLeftPx : bleed.overflowRightPx;
  return { ok: !hasVertical, side, overflowPx };
}

/* -------------------------------------------------------------------------- */
/* Grid                                                                       */
/* -------------------------------------------------------------------------- */

export interface GridRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// Grid's fill/knockout rects: `<rect x="..." y="..." width="..." height="..." fill="..."/>`.
// The canvas background rect (added by render.ts, outside mode content) has
// no x/y attributes, so it structurally never matches this pattern.
const GRID_RECT_RE = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="[^"]*"\/>/g;

export function parseGridRects(svg: string): GridRect[] {
  const rects: GridRect[] = [];
  for (const match of svg.matchAll(GRID_RECT_RE)) {
    const [, xStr, yStr, wStr, hStr] = match;
    rects.push({ x: Number(xStr), y: Number(yStr), width: Number(wStr), height: Number(hStr) });
  }
  return rects;
}

export function collectGlyphScales(svg: string): number[] {
  return Array.from(svg.matchAll(PATH_RE)).map((match) => Number(match[4]));
}

/**
 * grid.ts always emits its rects in a fixed order: the knockout plate (if
 * any) first, then fills - so the split is purely positional, not derived
 * from geometry. `hasAccent` should be `spec.params.accent !== null`.
 */
export interface GridSplitRects {
  readonly knockout: GridRect | null;
  readonly fills: readonly GridRect[];
}

export function splitGridRects(rects: readonly GridRect[], hasAccent: boolean): GridSplitRects {
  if (!hasAccent || rects.length === 0) return { knockout: null, fills: rects };
  return { knockout: rects[0], fills: rects.slice(1) };
}

export function checkGridSingleScale(scales: readonly number[]): ExactCheckResult {
  const distinct = Array.from(new Set(scales.map((s) => s.toFixed(6))));
  const violations =
    distinct.length > 1
      ? [`grid glyphs use ${distinct.length} distinct scales, expected exactly 1: ${distinct.join(', ')}`]
      : [];
  return { ok: violations.length === 0, violations };
}

export function checkGridModuleAlignment(rects: readonly GridRect[], cell: number): ExactCheckResult {
  const violations: string[] = [];
  for (const r of rects) {
    if (r.x % cell !== 0 || r.y % cell !== 0 || r.width % cell !== 0 || r.height % cell !== 0) {
      violations.push(`rect not module-aligned: x=${r.x} y=${r.y} width=${r.width} height=${r.height}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

function rectsIntersect(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function rowBBox(row: RowSpan): GridRect {
  return { x: row.minX, y: row.minY, width: row.maxX - row.minX, height: row.maxY - row.minY };
}

/**
 * The knockout plate is deliberately excluded from the word-ink overlap
 * check: it sits under the accented word's glyphs by design, so overlap
 * there is correct, not a defect. It is still checked against every fill,
 * since fills are supposed to only ever claim free modules.
 */
export function checkGridNoOverlap(
  fills: readonly GridRect[],
  knockout: GridRect | null,
  rows: readonly RowSpan[],
): ExactCheckResult {
  const violations: string[] = [];

  for (let i = 0; i < fills.length; i++) {
    for (let j = i + 1; j < fills.length; j++) {
      if (rectsIntersect(fills[i], fills[j])) violations.push(`fill ${i} overlaps fill ${j}`);
    }
  }

  for (const row of rows) {
    const bbox = rowBBox(row);
    for (let i = 0; i < fills.length; i++) {
      if (rectsIntersect(fills[i], bbox)) violations.push(`fill ${i} overlaps word ink at row y=${row.key}`);
    }
  }

  if (knockout !== null) {
    for (let i = 0; i < fills.length; i++) {
      if (rectsIntersect(fills[i], knockout)) violations.push(`fill ${i} overlaps knockout plate`);
    }
  }

  return { ok: violations.length === 0, violations };
}

export interface GridBandResult {
  readonly ok: boolean;
  readonly minClearancePx: number;
}

/**
 * Each grid row shares one baseline (see grid.ts), so its combined ink
 * extent - not any single word's own height - is what must clear `padding`
 * from both edges of its own 270px band.
 */
export function checkGridInkBand(rows: readonly RowSpan[], cell: number, padding: number): GridBandResult {
  if (rows.length === 0) return { ok: true, minClearancePx: 0 };

  let minClearancePx = Infinity;
  for (const row of rows) {
    const bandIndex = Math.floor((row.minY + row.maxY) / 2 / cell);
    const bandTop = bandIndex * cell;
    const bandBottom = bandTop + cell;
    minClearancePx = Math.min(minClearancePx, row.minY - bandTop, bandBottom - row.maxY);
  }

  return { ok: minClearancePx >= padding - 0.5, minClearancePx };
}

export interface GridRaggedRowsResult {
  readonly ok: boolean;
  readonly spreadPx: number;
  readonly widestPx: number;
  readonly narrowestPx: number;
  readonly totalRows: number;
}

/**
 * Distinguishes Grid from Stack (stage 8.3, debt 48 - replaces
 * checkGridAntiStack).
 *
 * The old check asked that half of Grid's rows stay narrower than 0.75 of
 * canvas width. That measured the wrong thing and fought the mode's own
 * constants: airy caps a word at maxSpan 2 of 4 modules, so two words fill
 * the row edge to edge by construction, and all three airy cases sat exactly
 * on the pass/fail boundary (1/2, 1/2, 1/4) - with an airy grid poster
 * (BRING SNACKS OR STAY HOME) already live in the gallery.
 *
 * What actually separates the two modes is the right edge, not the width:
 * Stack stretches every row to one shared measure, so its rows come out the
 * same width; Grid snaps rows to modules and leaves them ragged. So the test
 * is the spread between the widest and the narrowest row.
 *
 * The threshold comes from measuring both families rather than from a
 * module step (a module step is 270px nominally, but painted ink never
 * fills its module, so the ink-space difference of one module is not a
 * fixed number). Measured across every case the lab renders: Stack spreads
 * 0.00-0.02px across 21 multi-row cases - it is identically zero up to
 * toFixed noise - while Grid spreads 77.75-703.33px across 23. One percent
 * of canvas width (10.8px) sits ~540x above Stack's noise and ~7x below the
 * flattest Grid in the set, so it is not pinned to any single case.
 * A single-row poster has no spread to measure and passes.
 */
export function checkGridRaggedRows(
  rows: readonly RowSpan[],
  canvasWidth: number,
  minSpreadRatio = 0.01,
): GridRaggedRowsResult {
  if (rows.length < 2) {
    const only = rows.length === 1 ? rows[0].maxX - rows[0].minX : 0;
    return { ok: true, spreadPx: 0, widestPx: only, narrowestPx: only, totalRows: rows.length };
  }
  const widths = rows.map((r) => r.maxX - r.minX);
  const widestPx = Math.max(...widths);
  const narrowestPx = Math.min(...widths);
  const spreadPx = widestPx - narrowestPx;
  return {
    ok: spreadPx >= minSpreadRatio * canvasWidth,
    spreadPx,
    widestPx,
    narrowestPx,
    totalRows: rows.length,
  };
}

export interface GridAccentCorridorResult {
  readonly ok: boolean;
  readonly fillModuleCount: number;
  readonly upperBound: number;
}

// The largest single fill shape grid.ts can place (a 2x2 block). Slack on
// top of fillCapModules, sized to this, absorbs two things by design, not
// estimation: the guaranteed >=2-module first fill has priority over the
// cap and always proceeds even if it alone exceeds it, and the cap is only
// checked *before* each subsequent placement, so one more shape can still
// land after the accumulated area was already just under the cap.
const SHAPE_MAX_MODULES = 4;

/**
 * Fill area is density-capped via fillCapModules (grid.ts) now, not a raw
 * fraction of free modules - this corridor's job is to catch a genuine
 * regression (fills flooding most of the canvas) while tolerating the
 * bounded, by-design overshoot described above. The lower bound (at least
 * one fill) holds for every non-pathological case (some free modules
 * exist).
 */
export function checkGridAccentCorridor(
  fills: readonly GridRect[],
  cell: number,
  fillCapModules: number,
): GridAccentCorridorResult {
  const fillModuleCount = fills.reduce((sum, r) => sum + (r.width / cell) * (r.height / cell), 0);
  const upperBound = fillCapModules + SHAPE_MAX_MODULES;
  const ok = fillModuleCount >= 1 - 1e-9 && fillModuleCount <= upperBound + 1e-9;
  return { ok, fillModuleCount, upperBound };
}

/* -------------------------------------------------------------------------- */
/* Column                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every row's left ink edge must land on the column's shared left edge - one
 * row per word, all flush left, is the mode's defining silhouette.
 */
export function checkColumnLeftEdges(rows: readonly RowSpan[], epsPx = 0.05): ExactCheckResult {
  const violations: string[] = [];
  if (rows.length === 0) return { ok: true, violations };

  const reference = rows[0].minX;
  for (const row of rows) {
    if (Math.abs(row.minX - reference) > epsPx) {
      violations.push(`row at y=${row.key} left edge ${row.minX.toFixed(2)}px != ${reference.toFixed(2)}px`);
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Without an accent, every row shares one kegl (one distinct scale). With an
 * accent, exactly one row breaks away to its own scale - two distinct scale
 * values total, the odd one out applying to exactly one row.
 */
export function checkColumnScaleShape(rows: readonly RowSpan[], hasAccent: boolean): ExactCheckResult {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const key = row.scale.toFixed(6);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const sizes = Array.from(groups.values());

  if (!hasAccent) {
    const violations =
      groups.size === 1 ? [] : [`expected 1 distinct scale without an accent, found ${groups.size}: ${Array.from(groups.keys()).join(', ')}`];
    return { ok: violations.length === 0, violations };
  }

  const violations: string[] = [];
  if (groups.size !== 2) {
    violations.push(`expected 2 distinct scales with an accent, found ${groups.size}: ${Array.from(groups.keys()).join(', ')}`);
  } else if (!sizes.includes(1) || !sizes.includes(rows.length - 1)) {
    violations.push(`expected one scale used by exactly 1 row and the other by ${rows.length - 1}, found group sizes ${sizes.join(', ')}`);
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Splits rows into the accent row (the one whose scale is the minority value
 * - used by exactly one row) and the rest. Derived purely from the rendered
 * SVG, like splitGiantRow. Returns `accent: null` when there is no minority
 * scale (no accent, or checkColumnScaleShape already failed).
 */
export function splitColumnAccentRow(rows: readonly RowSpan[]): { accent: RowSpan | null; base: RowSpan[] } {
  const groups = new Map<string, RowSpan[]>();
  for (const row of rows) {
    const key = row.scale.toFixed(6);
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [row]);
    else bucket.push(row);
  }

  for (const bucket of groups.values()) {
    if (bucket.length === 1 && groups.size > 1) {
      const accent = bucket[0];
      return { accent, base: rows.filter((r) => r !== accent) };
    }
  }
  return { accent: null, base: rows.slice() };
}

/**
 * The measure is never exposed by column.ts (private by design), but it is
 * exactly reconstructible from the render: the base kegl is solved so the
 * widest non-accent word's ink exactly fills the measure, so that width IS
 * the measure.
 */
export function computeColumnMeasure(rows: readonly RowSpan[], accentRow: RowSpan | null): number {
  const baseRows = accentRow === null ? rows : rows.filter((r) => r !== accentRow);
  let widest = 0;
  for (const row of baseRows) {
    const width = row.maxX - row.minX;
    if (width > widest) widest = width;
  }
  return widest;
}

/**
 * No two vertically-adjacent lines may touch or overlap: the bottom edge of
 * the upper line's ink must sit strictly above the top edge of the lower
 * line's ink. `epsPx` only absorbs floating/rounding noise near the
 * boundary, it does not permit deliberate overlap.
 */
export function checkColumnNoOverlap(rows: readonly RowSpan[], epsPx = 0.05): ExactCheckResult {
  const violations: string[] = [];
  const sorted = rows.slice().sort((a, b) => a.minY - b.minY);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].minY - sorted[i - 1].maxY;
    if (gap <= -epsPx) {
      violations.push(
        `row at y=${sorted[i - 1].key} overlaps row at y=${sorted[i].key}: gap=${gap.toFixed(2)}px`,
      );
    }
  }
  return { ok: violations.length === 0, violations };
}

export function checkColumnAccentInk(accentRow: RowSpan, measurePx: number, marginSideMin = 54): ExactCheckResult {
  const violations: string[] = [];
  const width = accentRow.maxX - accentRow.minX;
  if (!(width > measurePx)) {
    violations.push(`accent ink width ${width.toFixed(2)}px is not greater than the measure ${measurePx.toFixed(2)}px`);
  }
  const rightLimit = POSTER_WIDTH - marginSideMin;
  if (accentRow.maxX > rightLimit + 0.05) {
    violations.push(`accent right edge ${accentRow.maxX.toFixed(2)}px exceeds ${rightLimit.toFixed(2)}px`);
  }
  return { ok: violations.length === 0, violations };
}

/* -------------------------------------------------------------------------- */
/* Ring                                                                       */
/* -------------------------------------------------------------------------- */

const RING_CX = POSTER_WIDTH / 2;
const RING_CY = POSTER_HEIGHT / 2;

// Only capHeight is needed here; a narrower cast than modes/*.ts's full
// FontMetrics widening since this file never touches glyph paths/advances
// directly - checks derive everything else from the emitted SVG itself.
const RING_CAP_HEIGHT = (onestGlyphs as unknown as { readonly '800': { readonly capHeight: number } })['800']
  .capHeight;

export interface RingGlyphSpan {
  readonly group: 'bottom' | 'top';
  readonly px: number;
  readonly py: number;
  readonly deg: number;
  /** fontSize / 1000, read directly from the glyph's own scale(). */
  readonly scale: number;
  /** Glyph advance in font units, derived from the transform's trailing translate(-adv/2 0). */
  readonly adv: number;
  readonly d: string;
}

// Ring's exact glyph-transform shape: translate(px,py) rotate(deg) scale(s)
// translate(-adv/2,0), space-separated, nothing else. Deliberately separate
// from the codebase-wide PATH_RE (stack/break/grid/column's translate+scale
// shape) - see checkParserSync's mode-aware skip in render-all.ts.
const RING_GLYPH_RE =
  /<path d="([^"]*)" transform="translate\((-?[\d.]+) (-?[\d.]+)\) rotate\((-?[\d.]+)\) scale\(([\d.]+)\) translate\((-?[\d.]+) 0\)"\/>/g;

// Matches modes/ring.ts's buildDiscPath exactly: two same-radius A-commands
// forming a full circle, starting/ending at the disc's left point.
const RING_DISC_RE =
  /<path d="M(-?[\d.]+),(-?[\d.]+) A([\d.]+),\3 0 1 1 (-?[\d.]+),\2 A\3,\3 0 1 1 \1,\2 Z" fill="([^"]*)"\/>/;

const RING_GROUP_RE = /<g fill="[^"]*">([\s\S]*?)<\/g>/g;

/**
 * ring.ts always emits exactly two glyph groups in a fixed order - the
 * bottom arc first, the top arc second (see modes/ring.ts's output order) -
 * so tagging by group index is purely positional, like grid.ts's rects.
 */
export function parseRingGlyphs(svg: string): RingGlyphSpan[] {
  const groups = Array.from(svg.matchAll(RING_GROUP_RE));
  const spans: RingGlyphSpan[] = [];

  groups.forEach((groupMatch, index) => {
    const group: RingGlyphSpan['group'] = index === 0 ? 'bottom' : 'top';
    for (const match of groupMatch[1].matchAll(RING_GLYPH_RE)) {
      const [, d, pxStr, pyStr, degStr, scaleStr, halfAdvStr] = match;
      spans.push({
        group,
        d,
        px: Number(pxStr),
        py: Number(pyStr),
        deg: Number(degStr),
        scale: Number(scaleStr),
        adv: -2 * Number(halfAdvStr),
      });
    }
  });

  return spans;
}

export function parseRingDiscRadius(svg: string): number | null {
  const match = RING_DISC_RE.exec(svg);
  return match === null ? null : Number(match[3]);
}

/**
 * t is measured from 12 o'clock, clockwise: px=cx+R sin(t), py=cy-R cos(t),
 * so t = atan2(px-cx, cy-py), range (-180,180]. This is the raw form; ring's
 * bottom arc can straddle the +-180 seam (its span is centered on t=PI), so
 * ordering/gap comparisons involving the bottom arc use the shifted variant
 * below instead.
 */
function reconstructAngleDeg(px: number, py: number): number {
  return (Math.atan2(px - RING_CX, RING_CY - py) * 180) / Math.PI;
}

function shiftNegativeDeg(deg: number): number {
  return deg < 0 ? deg + 360 : deg;
}

/** Continuous across the bottom arc's span - only for ordering/gap math within/against the bottom group, not for check 7's literal deg comparison (which needs the raw, unshifted value). */
function reconstructBottomAngleDeg(px: number, py: number): number {
  return shiftNegativeDeg(reconstructAngleDeg(px, py));
}

function angularDiffDeg(a: number, b: number): number {
  return Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
}

/** A glyph's angular half-width at the given radius, in degrees. */
function angularHalfWidthDeg(span: RingGlyphSpan, radius: number): number {
  const fontSize = span.scale * 1000;
  const halfWidthRad = (span.adv * fontSize) / 1000 / (2 * radius);
  return (halfWidthRad * 180) / Math.PI;
}

function transformInkCorner(
  lx: number,
  ly: number,
  px: number,
  py: number,
  deg: number,
  scale: number,
  adv: number,
): { x: number; y: number } {
  const x0 = lx - adv / 2;
  const y0 = ly;
  const x1 = x0 * scale;
  const y1 = y0 * scale;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x1 * cos - y1 * sin + px, y: x1 * sin + y1 * cos + py };
}

function transformedInkCorners(s: RingGlyphSpan): { x: number; y: number }[] {
  const bounds = getPathInkBounds(s.d);
  const corners: [number, number][] = [
    [bounds.x0, bounds.y0],
    [bounds.x1, bounds.y0],
    [bounds.x0, bounds.y1],
    [bounds.x1, bounds.y1],
  ];
  return corners.map(([lx, ly]) => transformInkCorner(lx, ly, s.px, s.py, s.deg, s.scale, s.adv));
}

// Grain dust paths (renderGrain, primitives.ts) carry no transform attribute
// at all - `<path d="..." fill="..." fill-opacity="...">` - so they are
// structurally distinguishable from both glyph and disc paths and must be
// excluded from the "every path is accounted for" count below.
const RING_GRAIN_PATH_RE = /<path d="[^"]*" fill="[^"]*" fill-opacity="[^"]*"\/>/g;

/** Check 1: every non-grain <path> in the ring SVG matches the exact glyph transform or the disc form. */
export function checkRingGlyphTransform(svg: string): ExactCheckResult {
  const totalPaths = Array.from(svg.matchAll(/<path /g)).length;
  const grainPaths = Array.from(svg.matchAll(RING_GRAIN_PATH_RE)).length;
  const glyphMatches = Array.from(svg.matchAll(RING_GLYPH_RE)).length;
  const discMatches = RING_DISC_RE.test(svg) ? 1 : 0;
  const nonGrainTotal = totalPaths - grainPaths;
  const violations =
    nonGrainTotal === glyphMatches + discMatches
      ? []
      : [
          `ring <path> shape mismatch: ${nonGrainTotal} non-grain <path> elements, but only ${glyphMatches} matched the glyph transform and ${discMatches} matched the disc form`,
        ];
  return { ok: violations.length === 0, violations };
}

/**
 * Check 2: non-tautological by construction. fsTop/fsBot come from each
 * glyph's own scale() (an independent read of the emitted string); rTop is
 * then computed analytically from fsTop and capHeight, and compared against
 * the glyph's *measured* distance from center. Bottom glyphs are compared
 * directly against OUTER (486) - there is no separate rInner placement
 * radius, rInner only drives the angular step (see modes/ring.ts).
 */
export function checkRingRadii(spans: readonly RingGlyphSpan[], tolPx = 0.05): ExactCheckResult {
  const violations: string[] = [];
  const c = RING_CAP_HEIGHT / 1000;

  for (const s of spans) {
    const measured = Math.hypot(s.px - RING_CX, s.py - RING_CY);
    if (s.group === 'top') {
      const fsTop = s.scale * 1000;
      const expected = RING_OUTER - c * fsTop;
      if (Math.abs(measured - expected) > tolPx) {
        violations.push(`top glyph radius ${measured.toFixed(3)}px != expected rTop ${expected.toFixed(3)}px`);
      }
    } else if (Math.abs(measured - RING_OUTER) > tolPx) {
      violations.push(`bottom glyph radius ${measured.toFixed(3)}px != OUTER ${RING_OUTER.toFixed(3)}px`);
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Check 3: exactly two glyph groups; the bottom group's glyph count matches the case's expected letter count. */
export function checkRingGroupShape(
  svg: string,
  spans: readonly RingGlyphSpan[],
  expectedBottomLetterCount: number,
): ExactCheckResult {
  const violations: string[] = [];
  const groupCount = Array.from(svg.matchAll(RING_GROUP_RE)).length;
  if (groupCount !== 2) {
    violations.push(`expected exactly 2 <g> glyph groups, found ${groupCount}`);
  }
  const bottomCount = spans.filter((s) => s.group === 'bottom').length;
  if (bottomCount !== expectedBottomLetterCount) {
    violations.push(`bottom group has ${bottomCount} glyphs, expected ${expectedBottomLetterCount}`);
  }
  return { ok: violations.length === 0, violations };
}

/** Check 4: angles strictly increasing along the top arc, strictly decreasing along the bottom arc. */
export function checkRingMonotonic(spans: readonly RingGlyphSpan[]): ExactCheckResult {
  const violations: string[] = [];
  const top = spans.filter((s) => s.group === 'top');
  const bottom = spans.filter((s) => s.group === 'bottom');

  for (let i = 1; i < top.length; i++) {
    const prev = reconstructAngleDeg(top[i - 1].px, top[i - 1].py);
    const curr = reconstructAngleDeg(top[i].px, top[i].py);
    if (!(curr > prev)) {
      violations.push(`top arc angle not strictly increasing at index ${i}: ${prev.toFixed(3)} -> ${curr.toFixed(3)}`);
    }
  }

  for (let i = 1; i < bottom.length; i++) {
    const prev = reconstructBottomAngleDeg(bottom[i - 1].px, bottom[i - 1].py);
    const curr = reconstructBottomAngleDeg(bottom[i].px, bottom[i].py);
    if (!(curr < prev)) {
      violations.push(`bottom arc angle not strictly decreasing at index ${i}: ${prev.toFixed(3)} -> ${curr.toFixed(3)}`);
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Check 5: nominal, not ink-based - deliberately separate from check 8.
 * A rotated round letter's actual ink-bbox corner overshoots 486 (cap-height
 * overshoot plus a tangential lever-arm from the half-advance rotation
 * pivot), so an ink-based "== 486" check is red by construction. This check
 * verifies the placement *math* instead: measured radius plus the nominal
 * ink-band width for the top arc, and the measured radius alone for the
 * bottom arc (whose baseline radius *is* its nominal outer edge).
 */
export function checkRingNominalOuterEdge(spans: readonly RingGlyphSpan[], tolPx = 0.05): ExactCheckResult {
  const violations: string[] = [];
  const c = RING_CAP_HEIGHT / 1000;

  for (const s of spans) {
    const measured = Math.hypot(s.px - RING_CX, s.py - RING_CY);
    if (s.group === 'top') {
      const fsTop = s.scale * 1000;
      const nominalOuter = measured + c * fsTop;
      if (Math.abs(nominalOuter - RING_OUTER) > tolPx) {
        violations.push(`top glyph nominal outer edge ${nominalOuter.toFixed(3)}px != OUTER ${RING_OUTER.toFixed(3)}px`);
      }
    } else if (Math.abs(measured - RING_OUTER) > tolPx) {
      violations.push(`bottom glyph nominal outer edge ${measured.toFixed(3)}px != OUTER ${RING_OUTER.toFixed(3)}px`);
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Check 6: both side gaps >= minGapDeg, measured between the outermost
 * top-arc and bottom-arc letters on each side, minus both letters' angular
 * half-widths. rTop/rInner must be the same radii the placement formulas
 * themselves used (see modes/ring.ts) - the half-width of an edge letter is
 * otherwise not well-defined.
 */
export function checkRingSideGaps(
  spans: readonly RingGlyphSpan[],
  rTop: number,
  rInner: number,
  minGapDeg = RING_SIDE_GAP_MIN_DEG,
): ExactCheckResult {
  const violations: string[] = [];
  const top = spans.filter((s) => s.group === 'top');
  const bottom = spans.filter((s) => s.group === 'bottom');
  if (top.length === 0 || bottom.length === 0) return { ok: true, violations };

  const topLeft = top[0];
  const topRight = top[top.length - 1];
  const bottomLeft = bottom[0];
  const bottomRight = bottom[bottom.length - 1];

  const topLeftDeg = shiftNegativeDeg(reconstructAngleDeg(topLeft.px, topLeft.py));
  const topRightDeg = shiftNegativeDeg(reconstructAngleDeg(topRight.px, topRight.py));
  const bottomLeftDeg = shiftNegativeDeg(reconstructAngleDeg(bottomLeft.px, bottomLeft.py));
  const bottomRightDeg = shiftNegativeDeg(reconstructAngleDeg(bottomRight.px, bottomRight.py));

  const gapRight =
    bottomRightDeg - topRightDeg - angularHalfWidthDeg(topRight, rTop) - angularHalfWidthDeg(bottomRight, rInner);
  const gapLeft =
    topLeftDeg - bottomLeftDeg - angularHalfWidthDeg(topLeft, rTop) - angularHalfWidthDeg(bottomLeft, rInner);

  if (gapRight < minGapDeg) violations.push(`right side gap ${gapRight.toFixed(3)}deg < ${minGapDeg}deg`);
  if (gapLeft < minGapDeg) violations.push(`left side gap ${gapLeft.toFixed(3)}deg < ${minGapDeg}deg`);

  return { ok: violations.length === 0, violations };
}

/**
 * Check 7: the load-bearing check. Literal deg in the transform vs. the
 * angle reconstructed independently from (px,py) - the only check that can
 * catch a rotation-direction/offset bug, since every other check reconstructs
 * its own angle from (px,py) and never looks at deg at all.
 */
export function checkRingDegMatchesAngle(spans: readonly RingGlyphSpan[], tolDeg = 0.01): ExactCheckResult {
  const violations: string[] = [];

  for (const s of spans) {
    const raw = reconstructAngleDeg(s.px, s.py);
    const expectedDeg = s.group === 'top' ? raw : raw + 180;
    const diff = angularDiffDeg(s.deg, expectedDeg);
    if (diff > tolDeg) {
      violations.push(
        `${s.group} glyph deg=${s.deg.toFixed(3)} does not match angle reconstructed from (px,py)=${expectedDeg.toFixed(3)} (diff=${diff.toFixed(3)}deg)`,
      );
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Check 8: actual ink, containment only. No equality to 486, no radius
 * check of any kind - that is entirely check 5's job, on nominal (non-ink)
 * numbers. Round-letter overshoot and the rotation lever-arm are expected
 * to push ink slightly past OUTER; the only requirement here is staying
 * inside the canvas.
 */
export function checkRingInkWithinCanvas(spans: readonly RingGlyphSpan[]): ExactCheckResult {
  const violations: string[] = [];
  for (const s of spans) {
    for (const corner of transformedInkCorners(s)) {
      if (corner.x < 0 || corner.x > POSTER_WIDTH || corner.y < 0 || corner.y > POSTER_HEIGHT) {
        violations.push(
          `${s.group} glyph ink corner (${corner.x.toFixed(2)}, ${corner.y.toFixed(2)}) outside canvas [0,${POSTER_WIDTH}]x[0,${POSTER_HEIGHT}]`,
        );
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Check 10 helper: thetaTop reconstructed purely from the rendered top group, in degrees. */
export function measureRingThetaTop(spans: readonly RingGlyphSpan[], rTop: number): number {
  const top = spans.filter((s) => s.group === 'top');
  if (top.length === 0) return 0;
  const first = top[0];
  const last = top[top.length - 1];
  const minAngle = reconstructAngleDeg(first.px, first.py);
  const maxAngle = reconstructAngleDeg(last.px, last.py);
  return maxAngle - minAngle + angularHalfWidthDeg(first, rTop) + angularHalfWidthDeg(last, rTop);
}

/** Check 11 (tolerance): fsBot/fsTop >= minRatio. */
export function checkRingBottomTopFsRatio(
  spans: readonly RingGlyphSpan[],
  minRatio = 1.25,
): { ratio: number; ok: boolean } {
  const top = spans.find((s) => s.group === 'top');
  const bottom = spans.find((s) => s.group === 'bottom');
  const fsTop = (top?.scale ?? 0) * 1000;
  const fsBot = (bottom?.scale ?? 0) * 1000;
  const ratio = fsTop > 0 ? fsBot / fsTop : 0;
  return { ratio, ok: ratio >= minRatio };
}

const RING_MIN_LETTER_GAP_DEG = 0.01;

/**
 * Per-pair angular gap between adjacent same-arc letters, at the given
 * radius, in degrees - the raw angle difference (accounting for the arc's
 * direction: top increases, bottom decreases and needs the wraparound-shifted
 * reconstruction) minus both letters' angular half-widths. Positive by
 * construction once TRACKING (modes/ring.ts) is nonzero: without it, adjacent
 * letters sit mathematically edge-to-edge (zero natural gap).
 */
export function measureRingLetterGaps(spans: readonly RingGlyphSpan[], group: RingGlyphSpan['group'], radius: number): number[] {
  const arc = spans.filter((s) => s.group === group);
  const gaps: number[] = [];

  for (let i = 1; i < arc.length; i++) {
    const prevDeg = group === 'top' ? reconstructAngleDeg(arc[i - 1].px, arc[i - 1].py) : reconstructBottomAngleDeg(arc[i - 1].px, arc[i - 1].py);
    const currDeg = group === 'top' ? reconstructAngleDeg(arc[i].px, arc[i].py) : reconstructBottomAngleDeg(arc[i].px, arc[i].py);
    const rawGap = group === 'top' ? currDeg - prevDeg : prevDeg - currDeg;
    gaps.push(rawGap - angularHalfWidthDeg(arc[i - 1], radius) - angularHalfWidthDeg(arc[i], radius));
  }

  return gaps;
}

/**
 * Check 12: the regression guard for the rInner-vs-rBot defect (see
 * modes/ring.ts's placeBottomArc), and its top-arc counterpart - the same
 * arithmetic applies there too, omitting it there was an oversight. Adjacent
 * same-arc letters' angular gap, minus both their angular half-widths, must
 * be at least RING_MIN_LETTER_GAP_DEG (not a bare "> 0": with TRACKING now
 * nonzero the expected gap is comfortably positive and far above
 * floating-point noise, so a small positive floor is the meaningful
 * assertion, not a zero one).
 */
export function checkRingLetterGap(
  spans: readonly RingGlyphSpan[],
  group: RingGlyphSpan['group'],
  radius: number,
  minGapDeg = RING_MIN_LETTER_GAP_DEG,
): ExactCheckResult {
  const violations: string[] = [];
  const gaps = measureRingLetterGaps(spans, group, radius);

  gaps.forEach((gap, i) => {
    if (gap < minGapDeg) {
      violations.push(`${group} letters ${i}/${i + 1} gap at r=${radius.toFixed(2)}px is ${gap.toFixed(4)}deg, expected >= ${minGapDeg}deg`);
    }
  });

  return { ok: violations.length === 0, violations };
}

/** Check 13a (tolerance): gap between the disc and the ink. */
export function checkRingDiscGap(discR: number, inner: number, minGapPx = 40): { gapPx: number; ok: boolean } {
  const gapPx = inner - discR;
  return { gapPx, ok: gapPx >= minGapPx };
}

// Replaces checkRingInkBandWidth (stage 8.3, debts 48 and 51). That check
// read "ink band width as a fraction of OUTER >= 0.12", but the band it was
// given is computed as capHeight/1000 * fsTop by the caller, never measured
// off the markup - so it was the top arc's font size in disguise, scaled by
// two constants. As a floor it was unreachable by construction: airy pins
// fsTop at FS_TO_OUTER.airy * OUTER = 0.14 * 486 = 68.04px, which lands the
// ratio at 0.099, below a threshold no airy poster could ever clear - and
// one such poster (LATE TRAINS AND GOOD FRIENDS) is in the live gallery,
// accepted by eye. So the check now states what it actually measures: the
// font size, in px, inside a corridor.
//
// Floor 55px: below ~0.81 of the airy nominal the arcs stop reading as a
// ring of words, and it still sits well above ring.ts's own MIN_FS of 40,
// where the mode throws. Shrink-to-fit legitimately lands under the nominal
// (seven words with an accent solve to 79.17 against a regular nominal of
// 97.20), so the floor has to leave room for it.
// Ceiling 150px: just above the tight nominal of 136.08, to catch a
// regression that inflates the kegl. The disc is guarded separately and on
// real radii by checkRingDiscGap, so this corridor does not repeat it.
export function checkRingFsCorridor(
  fsTopPx: number,
  minPx = 55,
  maxPx = 150,
): { fsTopPx: number; ok: boolean } {
  return { fsTopPx, ok: fsTopPx >= minPx && fsTopPx <= maxPx };
}

// scale() is emitted via toFixed(6) (modes/ring.ts), so each of fsTop/fsBot
// carries roughly 1e-6 of recoverable precision, and their ratio doubles
// that to roughly 1e-5 - a tighter tolerance can't distinguish real drift
// from the string round-trip itself. The equality requirement (BOTTOM_FS_MULT
// exactly) is unchanged; only the tolerance moved.
const RING_FS_EXACT_TOL = 1e-5;

/** Check 14: exact pin on fsBot/fsTop == BOTTOM_FS_MULT, distinct from check 11's looser floor. */
export function checkRingBottomFsExact(
  spans: readonly RingGlyphSpan[],
  expectedMult = BOTTOM_FS_MULT,
  tol = RING_FS_EXACT_TOL,
): ExactCheckResult {
  const violations: string[] = [];
  const top = spans.find((s) => s.group === 'top');
  const bottom = spans.find((s) => s.group === 'bottom');
  const fsTop = (top?.scale ?? 0) * 1000;
  const fsBot = (bottom?.scale ?? 0) * 1000;
  const ratio = fsTop > 0 ? fsBot / fsTop : 0;
  if (Math.abs(ratio - expectedMult) > tol) {
    violations.push(`fsBot/fsTop = ${ratio} != expected ${expectedMult} (tolerance ${tol})`);
  }
  return { ok: violations.length === 0, violations };
}
