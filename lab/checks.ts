import { POSTER_HEIGHT, POSTER_WIDTH } from '../lib/poster/types';
import { getPathInkBounds } from '../lib/poster/glyph-bounds';

export interface ExactCheckResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
}

const BANNED_SUBSTRINGS = ['<text', 'font', 'filter', 'blur', 'mask', 'foreignObject', 'Gradient'];
const EXPECTED_SVG_OPEN_TAG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">';

export function checkStructure(svg: string): ExactCheckResult {
  const violations: string[] = [];

  for (const needle of BANNED_SUBSTRINGS) {
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

export interface GridAntiStackResult {
  readonly ok: boolean;
  readonly narrowRowCount: number;
  readonly totalRows: number;
}

/**
 * Distinguishes Grid from Stack: at least half of Grid's rows must stay
 * narrower than 0.75 of canvas width, since Grid rows are module-bound, not
 * width-filling like Stack's.
 */
export function checkGridAntiStack(rows: readonly RowSpan[], canvasWidth: number): GridAntiStackResult {
  if (rows.length === 0) return { ok: true, narrowRowCount: 0, totalRows: 0 };
  const threshold = 0.75 * canvasWidth;
  const narrowRowCount = rows.filter((r) => r.maxX - r.minX <= threshold).length;
  return { ok: narrowRowCount >= Math.ceil(rows.length / 2), narrowRowCount, totalRows: rows.length };
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
