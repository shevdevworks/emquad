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
}

export function collectRows(svg: string): RowSpan[] {
  const rows = new Map<string, { minX: number; maxX: number }>();
  for (const s of parseGlyphs(svg)) {
    const row = rows.get(s.rowKey);
    if (row === undefined) {
      rows.set(s.rowKey, { minX: s.x0, maxX: s.x1 });
    } else {
      if (s.x0 < row.minX) row.minX = s.x0;
      if (s.x1 > row.maxX) row.maxX = s.x1;
    }
  }
  return Array.from(rows.entries()).map(([key, { minX, maxX }]) => ({ key, minX, maxX }));
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

export function checkVerticalMargins(
  svg: string,
  thresholdPercent: number,
): { topMarginPx: number; bottomMarginPx: number; diffPx: number; metric: ToleranceMetric } {
  const spans = parseGlyphs(svg);
  if (spans.length === 0) {
    return {
      topMarginPx: 0,
      bottomMarginPx: 0,
      diffPx: 0,
      metric: { label: 'vertical margins', value: 0, thresholdPercent, ok: true, note: 'n/a (no glyphs)' },
    };
  }

  const minY = Math.min(...spans.map((s) => s.y0));
  const maxY = Math.max(...spans.map((s) => s.y1));
  const topMarginPx = minY;
  const bottomMarginPx = POSTER_HEIGHT - maxY;
  const diffPx = Math.abs(topMarginPx - bottomMarginPx);
  const thresholdPx = (thresholdPercent / 100) * POSTER_HEIGHT;

  return {
    topMarginPx,
    bottomMarginPx,
    diffPx,
    metric: { label: 'vertical margins', value: diffPx, thresholdPercent, ok: diffPx <= thresholdPx },
  };
}

export function checkBleed(
  svg: string,
  allowBleed: boolean,
): { violationCount: number; maxOverflowPx: number; ok: boolean } {
  const spans = parseGlyphs(svg);
  let violationCount = 0;
  let maxOverflowPx = 0;

  for (const s of spans) {
    const overflow = Math.max(0 - s.x0, s.x1 - POSTER_WIDTH, 0 - s.y0, s.y1 - POSTER_HEIGHT, 0);
    if (overflow > 0) {
      violationCount++;
      if (overflow > maxOverflowPx) maxOverflowPx = overflow;
    }
  }

  return { violationCount, maxOverflowPx, ok: allowBleed || violationCount === 0 };
}
