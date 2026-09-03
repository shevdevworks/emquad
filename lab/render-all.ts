import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { DENSITIES, POSTER_HEIGHT, POSTER_WIDTH, type Density, type PosterSpec } from '../lib/poster/types';
import { render } from '../lib/poster/render';
import { splitWords } from '../lib/poster/validate';
import { MARGIN_RATIO } from '../lib/poster/modes/stack';
import { GIANT_MIN_INK_WIDTH_PX, MIN_GIANT_BLOCK_GAP_PX } from '../lib/poster/modes/break';
import { CELL, DENSITY_METRICS as GRID_DENSITY_METRICS, PADDING as GRID_PADDING } from '../lib/poster/modes/grid';
import { FS_TO_OUTER as RING_FS_TO_OUTER, OUTER as RING_OUTER } from '../lib/poster/modes/ring';
import onestGlyphs from '../lib/poster/onest-glyphs.json';
import { CASES } from './cases';
import {
  checkBleed,
  checkBlockLineSpacing,
  checkColumnAccentInk,
  checkColumnLeftEdges,
  checkColumnNoOverlap,
  checkColumnScaleShape,
  checkDeterminism,
  checkEdgeConvergence,
  checkGiantBlockGap,
  checkGiantMinWidth,
  checkGridAccentCorridor,
  checkGridAntiStack,
  checkGridInkBand,
  checkGridModuleAlignment,
  checkGridNoOverlap,
  checkGridSingleScale,
  checkParserSync,
  checkRingBottomFsExact,
  checkRingBottomTopFsRatio,
  checkRingDegMatchesAngle,
  checkRingDiscGap,
  checkRingGlyphTransform,
  checkRingGroupShape,
  checkRingInkBandWidth,
  checkRingInkWithinCanvas,
  checkRingLetterGap,
  checkRingMonotonic,
  checkRingNominalOuterEdge,
  checkRingRadii,
  checkRingSideGaps,
  checkSingleSidedHorizontalBleed,
  checkStructure,
  checkVerticalMargins,
  collectGlyphScales,
  collectRows,
  computeColumnMeasure,
  countGlyphPaths,
  measureRingLetterGaps,
  measureRingThetaTop,
  parseGridRects,
  parseRingDiscRadius,
  parseRingGlyphs,
  splitColumnAccentRow,
  splitGiantRow,
  splitGridRects,
  type ToleranceMetric,
  type VerticalMarginsResult,
} from './checks';
import { renderSheet, type SheetBeforeAfterRow, type SheetCard, type SheetGroup } from './sheet';

// Only capHeight is needed here; a narrower cast than modes/*.ts's full
// FontMetrics widening - see checks.ts's identical RING_CAP_HEIGHT.
const RING_CAP_HEIGHT = (onestGlyphs as unknown as { readonly '800': { readonly capHeight: number } })['800']
  .capHeight;

const DEFAULT_EDGE_CONVERGENCE_PERCENT = 0.5;
// Percent deviation of the bottom/top margin ratio tolerated from its
// expected value — generous relative to the ~0.001% drift toFixed rounding
// actually produces, so it catches formula regressions without ever being
// noisy on correct output. See checks.ts's checkVerticalMargins.
const DEFAULT_VERTICAL_RATIO_PERCENT = 2;

// Column pins its block top to a fixed pixel offset rather than a ratio, so
// it gets its own exact check instead of checkVerticalMargins' ratio-based one.
const COLUMN_MARGIN_TOP_PX = 81;
const COLUMN_MARGIN_TOP_EPS_PX = 0.05;
const COLUMN_MEASURE_MAX_RATIO = 0.66;
const COLUMN_BLOCK_HEIGHT_MAX_RATIO = 0.8;
const COLUMN_TIGHT_AIRY_KEGL_MIN_RATIO = 1.7;
const RING_THETA_TOP_TIGHT_AIRY_MIN_RATIO = 1.8;

// Mirrors column.ts's private COLUMN_WIDTH_RATIO, duplicated here only so the
// lab can report the design measure next to the actual one - column.ts
// itself never exports it.
const COLUMN_WIDTH_RATIO: Record<Density, number> = { tight: 0.62, regular: 0.46, airy: 0.32 };
// How far below the design measure the actual measure has to fall before
// it's read as "the height-cap shrink loop fired", rather than ordinary
// toFixed(2) rounding noise (worth a fraction of a px, never this much).
const COLUMN_SHRINK_DETECT_EPS_PX = 0.5;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const filterArg = args.find((a) => a.startsWith('--filter='));
const filter = filterArg ? filterArg.slice('--filter='.length) : undefined;

const selectedCases = filter ? CASES.filter((c) => c.id.includes(filter)) : CASES;

const outDir = path.resolve(process.cwd(), 'lab', 'out');
fs.mkdirSync(outDir, { recursive: true });

const prevDir = path.resolve(process.cwd(), 'lab', 'prev');
if (!filter) {
  fs.rmSync(prevDir, { recursive: true, force: true });
  fs.mkdirSync(prevDir, { recursive: true });
  for (const file of fs.readdirSync(outDir)) {
    if (file.endsWith('.svg')) {
      fs.copyFileSync(path.join(outDir, file), path.join(prevDir, file));
    }
  }
}

function formatCaption(spec: PosterSpec): string {
  const p = spec.params;
  return `density=${p.density} invert=${p.invert ? 'on' : 'off'} accent=${p.accent === null ? 'none' : p.accent} grain=${p.grain} seed=${p.seed}`;
}

function pctOf(value: number, dimension: number): number {
  return (value / dimension) * 100;
}

function fmtMetric(label: string, metric: ToleranceMetric, dimension: number): string {
  if (metric.note) return `${label}=${metric.note}`;
  const pct = pctOf(metric.value, dimension);
  return `${label}=${metric.value.toFixed(2)}px(${pct.toFixed(2)}%)${metric.ok ? '' : '!'}`;
}

function fmtVertical(v: VerticalMarginsResult, expectedRatio: number | null): string {
  const ratioStr = v.ratio === null ? 'n/a' : v.ratio.toFixed(4);
  const expectedStr = expectedRatio === null ? 'n/a' : expectedRatio.toFixed(4);
  const devStr = v.metric.note ? v.metric.note : `${v.metric.value.toFixed(2)}%${v.metric.ok ? '' : '!'}`;
  return `vertical(top=${v.topMarginPx.toFixed(2)} bottom=${v.bottomMarginPx.toFixed(2)} signedDiff=${v.signedDiffPx.toFixed(2)} ratio=${ratioStr} expected=${expectedStr} dev=${devStr})`;
}

interface CaseResult {
  readonly id: string;
  readonly svg: string;
  readonly phrase: string;
  readonly density: Density;
  readonly blockHeightPx: number;
  readonly inkTopPercent: number;
  readonly inkBottomPercent: number;
  readonly fullCaption: string;
}

const results: CaseResult[] = [];
const hashes: Record<string, string> = {};
const columnBaseScales = new Map<string, number>();
const columnShrinkCases: { id: string; measureActualPx: number; measureDesignPx: number }[] = [];
const ringThetaTops = new Map<string, number>();
const ringCardExtras = new Map<string, { fsTop: number; bandWidthRatio: number }>();
let exactFailures = 0;
let toleranceViolations = 0;

for (const labCase of selectedCases) {
  const isBreak = labCase.spec.params.mode === 'break';
  const isGrid = labCase.spec.params.mode === 'grid';
  const isColumn = labCase.spec.params.mode === 'column';
  const isRing = labCase.spec.params.mode === 'ring';
  const svgA = render(labCase.spec);
  const svgB = render(labCase.spec);

  const structure = checkStructure(svgA, labCase.spec.params.mode);
  const determinism = checkDeterminism(svgA, svgB);
  const pathCount = countGlyphPaths(svgA);
  // Ring's glyph transform is a 4-part translate/rotate/scale/translate
  // chain that the codebase-wide PATH_RE (translate+scale only) can never
  // match, so pathCount legitimately reads 0 for ring - checkParserSync's
  // "found <path> but 0 matched" guard is skipped for ring specifically;
  // ring's own checkRingGlyphTransform (below) supersedes it.
  const parserSync = isRing ? { ok: true, violations: [] as string[] } : checkParserSync(svgA, pathCount);
  const rows = collectRows(svgA);

  const edgePercent = labCase.thresholds?.edgeConvergencePercent ?? DEFAULT_EDGE_CONVERGENCE_PERCENT;
  const verticalPercent = labCase.thresholds?.verticalPercent ?? DEFAULT_VERTICAL_RATIO_PERCENT;

  // Grid has no page margins at all (the module grid runs to the canvas
  // edge), so - like Break - it has no margin-ratio invariant to check;
  // the measurement still runs, diagnostic-only. Column pins its top margin
  // to a fixed px offset instead of a ratio, so it's diagnostic-only here too.
  // Ring is radial, not stacked, so it has no such invariant either - its
  // glyphs don't match PATH_RE at all, so this would already no-op, but the
  // gate is made explicit rather than left accidentally-correct.
  const vertical = checkVerticalMargins(
    svgA,
    isBreak || isGrid || isColumn || isRing ? null : MARGIN_RATIO,
    verticalPercent,
  );
  const bleed = checkBleed(svgA, labCase.allowBleed ?? false);

  const baseExactViolations = [...structure.violations, ...determinism.violations, ...parserSync.violations];

  let extraFields: string[];
  let toleranceChecks: boolean[];
  let gridExactViolations: string[] = [];
  let columnExactViolations: string[] = [];
  let ringExactViolations: string[] = [];

  if (isBreak) {
    const { blockRows } = splitGiantRow(rows);
    const { left: edgeLeftBlock } = checkEdgeConvergence(blockRows, edgePercent);
    const singleSided = checkSingleSidedHorizontalBleed(bleed);
    const gap = checkGiantBlockGap(rows, MIN_GIANT_BLOCK_GAP_PX);
    const lineSpacing = checkBlockLineSpacing(blockRows);
    const giantWidth = checkGiantMinWidth(rows, GIANT_MIN_INK_WIDTH_PX);

    extraFields = [
      fmtMetric('edge-left-block', edgeLeftBlock, POSTER_WIDTH),
      'edge-right=n/a (block ragged right)',
      `bleed-side=${singleSided.side}(${singleSided.overflowPx.toFixed(2)}px)${singleSided.ok ? '' : '!'}`,
      `block-gap=${gap.gapPx.toFixed(2)}px${gap.ok ? '' : '!'}`,
      `line-gap=${lineSpacing.minGapPx.toFixed(2)}px${lineSpacing.ok ? '' : '!'}`,
      `giant-width=${giantWidth.widthPx.toFixed(2)}px${giantWidth.ok ? '' : '!'}`,
    ];
    toleranceChecks = [edgeLeftBlock.ok, singleSided.ok, gap.ok, lineSpacing.ok, giantWidth.ok];
  } else if (isGrid) {
    const gridRects = parseGridRects(svgA);
    const hasAccent = labCase.spec.params.accent !== null;
    const { knockout, fills } = splitGridRects(gridRects, hasAccent);
    const scales = collectGlyphScales(svgA);
    const singleScale = checkGridSingleScale(scales);
    const moduleAlignment = checkGridModuleAlignment(gridRects, CELL);
    const noOverlap = checkGridNoOverlap(fills, knockout, rows);
    const { fillCapModules } = GRID_DENSITY_METRICS[labCase.spec.params.density];
    const inkBand = checkGridInkBand(rows, CELL, GRID_PADDING);
    const antiStack = checkGridAntiStack(rows, POSTER_WIDTH);
    const corridor = checkGridAccentCorridor(fills, CELL, fillCapModules);
    const kegl = scales.length > 0 ? scales[0] * 1000 : 0;

    extraFields = [
      `kegl=${kegl.toFixed(2)}`,
      `scale=${singleScale.ok ? 'single' : `FAIL:${singleScale.violations.join('; ')}`}`,
      `module-align=${moduleAlignment.ok ? 'ok' : 'FAIL'}`,
      `overlap=${noOverlap.ok ? 'ok' : `FAIL:${noOverlap.violations.join('; ')}`}`,
      `ink-band=${inkBand.minClearancePx.toFixed(2)}px${inkBand.ok ? '' : '!'}`,
      `anti-stack=${antiStack.narrowRowCount}/${antiStack.totalRows}${antiStack.ok ? '' : '!'}`,
      `fills=${fills.length}(${corridor.fillModuleCount.toFixed(1)}mod<=${corridor.upperBound}mod)${corridor.ok ? '' : '!'}`,
      `bleed=${bleed.ok ? 'ok' : 'FAIL'}(${bleed.violationCount}/${bleed.maxOverflowPx.toFixed(2)}px)`,
    ];
    // Per spec, module alignment, the single-scale invariant, no-overlap and
    // the ink-within-band margin are exact (must always hold, not just under
    // --strict). Anti-Stack is a tolerance check instead: three long words
    // at one shared kegl legitimately solve to three wide rows - that alone
    // does not stop the result from being Grid (ragged right edge,
    // module-aligned fills), so it must not hard-fail a valid phrase.
    gridExactViolations = [
      ...singleScale.violations,
      ...moduleAlignment.violations,
      ...noOverlap.violations,
      ...(inkBand.ok ? [] : [`ink-band clearance ${inkBand.minClearancePx.toFixed(2)}px below padding`]),
    ];
    toleranceChecks = [antiStack.ok, corridor.ok, bleed.ok];
  } else if (isColumn) {
    const hasAccent = labCase.spec.params.accent !== null;
    const wordCount = splitWords(labCase.spec.phrase).length;
    const rowCountOk = rows.length === wordCount;
    const leftEdges = checkColumnLeftEdges(rows);
    const scaleShape = checkColumnScaleShape(rows, hasAccent);
    const noOverlap = checkColumnNoOverlap(rows);
    const topMarginOk = Math.abs(vertical.topMarginPx - COLUMN_MARGIN_TOP_PX) <= COLUMN_MARGIN_TOP_EPS_PX;
    const { accent: accentRow, base: baseRows } = splitColumnAccentRow(rows);
    const measurePx = computeColumnMeasure(rows, accentRow);
    const accentInk =
      hasAccent && accentRow !== null
        ? checkColumnAccentInk(accentRow, measurePx)
        : { ok: true, violations: [] as string[] };

    const measureDesignPx = COLUMN_WIDTH_RATIO[labCase.spec.params.density] * POSTER_WIDTH;
    const shrinkTriggered = measureDesignPx - measurePx > COLUMN_SHRINK_DETECT_EPS_PX;
    if (shrinkTriggered) {
      columnShrinkCases.push({ id: labCase.id, measureActualPx: measurePx, measureDesignPx });
    }

    const measureBoundOk = measurePx <= COLUMN_MEASURE_MAX_RATIO * POSTER_WIDTH;
    const blockHeightPx = POSTER_HEIGHT - vertical.topMarginPx - vertical.bottomMarginPx;
    const heightBoundOk = blockHeightPx <= COLUMN_BLOCK_HEIGHT_MAX_RATIO * POSTER_HEIGHT;

    // Base kegl = the scale shared by every non-accent row (the larger of
    // the two scale groups when an accent is present, the only group
    // otherwise) - captured per-case so the tight/airy ratio can be checked
    // across cases once every case has run.
    const baseScaleRows = accentRow === null ? rows : baseRows;
    if (baseScaleRows.length > 0) {
      columnBaseScales.set(labCase.id, baseScaleRows[0].scale);
    }

    columnExactViolations = [
      ...(rowCountOk ? [] : [`row count ${rows.length} != word count ${wordCount}`]),
      ...leftEdges.violations,
      ...scaleShape.violations,
      ...noOverlap.violations,
      ...(topMarginOk ? [] : [`top margin ${vertical.topMarginPx.toFixed(2)}px != ${COLUMN_MARGIN_TOP_PX}px`]),
      ...accentInk.violations,
    ];

    extraFields = [
      `measure=${measurePx.toFixed(2)}px${measureBoundOk ? '' : '!'} design=${measureDesignPx.toFixed(2)}px${shrinkTriggered ? ' shrink!' : ''}`,
      `kegl-base=${((baseScaleRows[0]?.scale ?? 0) * 1000).toFixed(2)}`,
      `top=${vertical.topMarginPx.toFixed(2)}px${topMarginOk ? '' : '!'}`,
      `block-height=${blockHeightPx.toFixed(2)}px${heightBoundOk ? '' : '!'}`,
      `overlap=${noOverlap.ok ? 'ok' : `FAIL:${noOverlap.violations.join('; ')}`}`,
      `bleed=${bleed.ok ? 'ok' : 'FAIL'}(${bleed.violationCount}/${bleed.maxOverflowPx.toFixed(2)}px)`,
    ];
    toleranceChecks = [measureBoundOk, heightBoundOk, bleed.ok];
  } else if (isRing) {
    const phraseWords = splitWords(labCase.spec.phrase);
    const bottomIndex = labCase.spec.params.accent ?? phraseWords.length - 1;
    const expectedBottomLetterCount = Array.from(phraseWords[bottomIndex]).length;

    const spans = parseRingGlyphs(svgA);
    const topSpan = spans.find((s) => s.group === 'top');
    const bottomSpan = spans.find((s) => s.group === 'bottom');
    const fsTop = (topSpan?.scale ?? 0) * 1000;
    const fsBot = (bottomSpan?.scale ?? 0) * 1000;
    const c = RING_CAP_HEIGHT / 1000;
    const rTop = RING_OUTER - c * fsTop;
    const rInner = RING_OUTER - c * fsBot;
    const inner = RING_OUTER - c * Math.max(fsTop, fsBot);
    const bandWidthPx = c * fsTop;
    const discR = parseRingDiscRadius(svgA) ?? 0;

    const glyphTransform = checkRingGlyphTransform(svgA);
    const radii = checkRingRadii(spans);
    const groupShape = checkRingGroupShape(svgA, spans, expectedBottomLetterCount);
    const monotonic = checkRingMonotonic(spans);
    const nominalOuterEdge = checkRingNominalOuterEdge(spans);
    const sideGaps = checkRingSideGaps(spans, rTop, rInner);
    const degMatch = checkRingDegMatchesAngle(spans);
    const inCanvas = checkRingInkWithinCanvas(spans);
    const fsRatio = checkRingBottomTopFsRatio(spans);
    const topGap = checkRingLetterGap(spans, 'top', rTop);
    const bottomGap = checkRingLetterGap(spans, 'bottom', rInner);
    const discGap = checkRingDiscGap(discR, inner);
    const bandWidth = checkRingInkBandWidth(bandWidthPx);
    const fsExact = checkRingBottomFsExact(spans);
    const thetaTopDeg = measureRingThetaTop(spans, rTop);
    ringThetaTops.set(labCase.id, thetaTopDeg);
    ringCardExtras.set(labCase.id, { fsTop, bandWidthRatio: bandWidth.ratio });

    const allGaps = [...measureRingLetterGaps(spans, 'top', rTop), ...measureRingLetterGaps(spans, 'bottom', rInner)];
    const gapMinDeg = allGaps.length > 0 ? Math.min(...allGaps) : 0;
    const gapMaxDeg = allGaps.length > 0 ? Math.max(...allGaps) : 0;
    const fsTopNominal = RING_FS_TO_OUTER[labCase.spec.params.density] * RING_OUTER;
    const shrunk = fsTopNominal - fsTop > 0.01;

    ringExactViolations = [
      ...glyphTransform.violations,
      ...radii.violations,
      ...groupShape.violations,
      ...monotonic.violations,
      ...nominalOuterEdge.violations,
      ...sideGaps.violations,
      ...degMatch.violations,
      ...inCanvas.violations,
      ...topGap.violations,
      ...bottomGap.violations,
      ...fsExact.violations,
    ];

    extraFields = [
      `fsTop=${fsTop.toFixed(2)}`,
      `fsBot=${fsBot.toFixed(2)}`,
      `thetaTop=${thetaTopDeg.toFixed(2)}deg`,
      `gap-min=${gapMinDeg.toFixed(4)}deg gap-max=${gapMaxDeg.toFixed(4)}deg`,
      `shrink=${shrunk ? 'yes' : 'no'}`,
      `fs-ratio=${fsRatio.ratio.toFixed(3)}${fsRatio.ok ? '' : '!'}`,
      `disc-gap=${discGap.gapPx.toFixed(2)}px${discGap.ok ? '' : '!'}`,
      `band-width=${bandWidth.ratio.toFixed(3)}${bandWidth.ok ? '' : '!'}`,
      `bleed=${bleed.ok ? 'ok' : 'FAIL'}(${bleed.violationCount}/${bleed.maxOverflowPx.toFixed(2)}px)`,
    ];
    toleranceChecks = [fsRatio.ok, discGap.ok, bandWidth.ok, bleed.ok];
  } else {
    const { left, right } = checkEdgeConvergence(rows, edgePercent);
    extraFields = [
      fmtMetric('edge-left', left, POSTER_WIDTH),
      fmtMetric('edge-right', right, POSTER_WIDTH),
      `bleed=${bleed.ok ? 'ok' : 'FAIL'}(${bleed.violationCount}/${bleed.maxOverflowPx.toFixed(2)}px)`,
    ];
    toleranceChecks = [left.ok, right.ok, bleed.ok];
  }
  toleranceChecks.push(vertical.metric.ok);

  const exactViolations = [...baseExactViolations, ...gridExactViolations, ...columnExactViolations, ...ringExactViolations];
  const exactOk = exactViolations.length === 0;
  if (!exactOk) exactFailures++;

  const toleranceFails = toleranceChecks.filter((ok) => !ok).length;
  toleranceViolations += toleranceFails;

  fs.writeFileSync(path.join(outDir, `${labCase.id}.svg`), svgA, 'utf8');
  hashes[labCase.id] = crypto.createHash('sha256').update(svgA, 'utf8').digest('hex');

  const minY = vertical.topMarginPx;
  const maxY = POSTER_HEIGHT - vertical.bottomMarginPx;

  results.push({
    id: labCase.id,
    svg: svgA,
    phrase: labCase.spec.phrase,
    density: labCase.spec.params.density,
    blockHeightPx: maxY - minY,
    inkTopPercent: pctOf(minY, POSTER_HEIGHT),
    inkBottomPercent: pctOf(maxY, POSTER_HEIGHT),
    fullCaption: formatCaption(labCase.spec),
  });

  const line = [
    exactOk ? '[PASS]' : '[FAIL]',
    labCase.id,
    `exact=${exactOk ? 'ok' : `FAIL:${exactViolations.join('; ')}`}`,
    `paths=${pathCount}`,
    `rows=${rows.length}`,
    ...extraFields,
    fmtVertical(vertical, isBreak || isGrid || isColumn || isRing ? null : MARGIN_RATIO),
  ].join(' ');
  console.log(line);
}

// Density controls the column's measure directly, so a tighter density must
// produce a visibly larger base kegl than an airy one - checked across the
// two density-triple cases rather than per-case, since it's a relationship
// between two renders, not a property of either alone.
const tightScale = columnBaseScales.get('column-density-tight');
const airyScale = columnBaseScales.get('column-density-airy');
if (tightScale !== undefined && airyScale !== undefined) {
  const ratio = tightScale / airyScale;
  const ok = ratio >= COLUMN_TIGHT_AIRY_KEGL_MIN_RATIO;
  if (!ok) toleranceViolations++;
  console.log(
    `[${ok ? 'PASS' : 'FAIL'}] column tight/airy kegl ratio=${ratio.toFixed(3)} (min ${COLUMN_TIGHT_AIRY_KEGL_MIN_RATIO})${ok ? '' : '!'}`,
  );
}

// Density sets the top arc's font size directly, so a tighter density must
// produce a visibly larger thetaTop than an airy one - checked across the
// two density-triple cases rather than per-case, same as column's kegl ratio.
const ringThetaTopTight = ringThetaTops.get('ring-density-tight');
const ringThetaTopAiry = ringThetaTops.get('ring-density-airy');
if (ringThetaTopTight !== undefined && ringThetaTopAiry !== undefined) {
  const ratio = ringThetaTopTight / ringThetaTopAiry;
  const ok = ratio >= RING_THETA_TOP_TIGHT_AIRY_MIN_RATIO;
  if (!ok) toleranceViolations++;
  console.log(
    `[${ok ? 'PASS' : 'FAIL'}] ring tight/airy thetaTop ratio=${ratio.toFixed(3)} (min ${RING_THETA_TOP_TIGHT_AIRY_MIN_RATIO})${ok ? '' : '!'}`,
  );
}

if (columnShrinkCases.length > 0) {
  console.log('\ncolumn height-cap triggered on:');
  for (const c of columnShrinkCases) {
    console.log(
      `  ${c.id}: measure actual=${c.measureActualPx.toFixed(2)}px design=${c.measureDesignPx.toFixed(2)}px`,
    );
  }
}

console.log(
  `\n${selectedCases.length} cases, ${exactFailures} exact failures, ${toleranceViolations} tolerance violations${strict ? ' (strict)' : ''}`,
);

if (!filter) {
  const sortedHashes = Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(outDir, 'hashes.json'), `${JSON.stringify(sortedHashes, null, 2)}\n`, 'utf8');

  const toCard = (r: CaseResult): SheetCard => ({
    id: r.id,
    svg: r.svg,
    shortCaption: `${r.density} · ${Math.round(r.blockHeightPx)}px`,
    fullCaption: r.fullCaption,
    inkTopPercent: r.inkTopPercent,
    inkBottomPercent: r.inkBottomPercent,
  });

  // Ring cards skip inkTopPercent/inkBottomPercent: the glyph-ink parser
  // never matches ring's glyph transform, so those fields would read as
  // 0%/100% and paint guide-lines pinned to the card edges - noise, not
  // signal. Caption carries fsTop/band-width ratio instead, already
  // computed per-case in the main loop (ringCardExtras).
  const toRingCard = (r: CaseResult): SheetCard => {
    const extras = ringCardExtras.get(r.id);
    const metrics = extras ? ` fsTop=${extras.fsTop.toFixed(2)} band=${extras.bandWidthRatio.toFixed(3)}` : '';
    return {
      id: r.id,
      svg: r.svg,
      shortCaption: `${r.density}${metrics}`,
      fullCaption: r.fullCaption,
    };
  };

  function findResult(id: string): CaseResult {
    const r = results.find((x) => x.id === id);
    if (!r) throw new Error(`ring group: case "${id}" not found`);
    return r;
  }

  const ringCard = (id: string): SheetCard => toRingCard(findResult(id));
  const gridCardById = (id: string): SheetCard => toCard(findResult(id));

  const geometryResults = results.filter((r) => r.id.startsWith('geometry-'));
  const phraseOrder: string[] = [];
  const byPhrase = new Map<string, CaseResult[]>();
  for (const r of geometryResults) {
    if (!byPhrase.has(r.phrase)) {
      byPhrase.set(r.phrase, []);
      phraseOrder.push(r.phrase);
    }
    byPhrase.get(r.phrase)!.push(r);
  }
  const phraseGroups: SheetGroup[] = phraseOrder.map((phrase) => ({
    title: `Density — ${phrase}`,
    cards: byPhrase
      .get(phrase)!
      .slice()
      .sort((a, b) => DENSITIES.indexOf(a.density) - DENSITIES.indexOf(b.density))
      .map(toCard),
  }));

  const grainResults = results.filter((r) => r.id.startsWith('grain-'));

  const breakGeometryResults = results.filter((r) => r.id.startsWith('break-') && !r.id.includes('accent'));
  const breakPhraseOrder: string[] = [];
  const breakByPhrase = new Map<string, CaseResult[]>();
  for (const r of breakGeometryResults) {
    if (!breakByPhrase.has(r.phrase)) {
      breakByPhrase.set(r.phrase, []);
      breakPhraseOrder.push(r.phrase);
    }
    breakByPhrase.get(r.phrase)!.push(r);
  }
  const breakPhraseGroups: SheetGroup[] = breakPhraseOrder.map((phrase) => ({
    title: `Break — ${phrase}`,
    cards: breakByPhrase
      .get(phrase)!
      .slice()
      .sort((a, b) => DENSITIES.indexOf(a.density) - DENSITIES.indexOf(b.density))
      .map(toCard),
  }));
  const breakAccentResults = results.filter((r) => r.id.startsWith('break-') && r.id.includes('accent'));

  const gridGeometryResults = results.filter((r) => r.id.startsWith('grid-') && !r.id.includes('accent'));
  const gridPhraseOrder: string[] = [];
  const gridByPhrase = new Map<string, CaseResult[]>();
  for (const r of gridGeometryResults) {
    if (!gridByPhrase.has(r.phrase)) {
      gridByPhrase.set(r.phrase, []);
      gridPhraseOrder.push(r.phrase);
    }
    gridByPhrase.get(r.phrase)!.push(r);
  }
  const gridPhraseGroups: SheetGroup[] = gridPhraseOrder.map((phrase) => ({
    title: `Grid — ${phrase}`,
    cards: gridByPhrase
      .get(phrase)!
      .slice()
      .sort((a, b) => DENSITIES.indexOf(a.density) - DENSITIES.indexOf(b.density))
      .map(toCard),
  }));
  const gridAccentResults = results.filter((r) => r.id.startsWith('grid-') && r.id.includes('accent'));

  const ringDensityGroup: SheetGroup = {
    title: 'Ring — density',
    cards: ['ring-density-tight', 'ring-density-regular', 'ring-density-airy'].map(ringCard),
  };

  const ringBottomArcGroup: SheetGroup = {
    title: 'Ring — bottom arc',
    cards: [
      'ring-accent-first',
      'ring-accent-middle',
      'ring-accent-last-seven',
      'ring-seven-words-no-accent',
    ].map(ringCard),
  };

  const ringVarietyGroup: SheetGroup = {
    title: 'Ring — variety',
    cards: [
      'ring-three-short-words',
      'ring-cyrillic',
      'ring-seed-100',
      'ring-seed-500',
      'ring-invert',
    ].map(ringCard),
  };

  const ringVsGridSilhouetteGroup: SheetGroup = {
    title: 'Ring vs Grid — silhouette',
    cards: [
      ringCard('ring-density-regular'),
      gridCardById('grid-accent-knockout-first'),
      ringCard('ring-seven-words-no-accent'),
      gridCardById('grid-accent-knockout-last'),
    ],
    fixedCellWidthPx: 280,
  };

  const ringBandWidthViolationsGroup: SheetGroup = {
    title: 'Ring — band width violations',
    cards: ['ring-density-airy', 'ring-accent-last-seven'].map(ringCard),
  };

  const groups: SheetGroup[] = [
    ...phraseGroups,
    { title: 'Dust', cards: grainResults.map(toCard) },
    { title: 'Dust — 504px OG crop', cards: grainResults.map(toCard), fixedCellWidthPx: 504 },
    { title: 'Colour', cards: results.filter((r) => r.id.startsWith('color-')).map(toCard) },
    { title: 'Fixtures', cards: results.filter((r) => r.id.startsWith('fixture-')).map(toCard) },
    ...breakPhraseGroups,
    { title: 'Break — accent', cards: breakAccentResults.map(toCard) },
    ...gridPhraseGroups,
    { title: 'Grid — accent', cards: gridAccentResults.map(toCard) },
    ringDensityGroup,
    ringBottomArcGroup,
    ringVarietyGroup,
    ringVsGridSilhouetteGroup,
    ringBandWidthViolationsGroup,
  ];

  const BEFORE_AFTER_IDS: readonly string[] = [
    'geometry-stay-weird-forever-tight',
    'geometry-stay-weird-forever-regular',
    'geometry-stay-weird-forever-airy',
  ];

  function toPrevCard(id: string, svg: string): SheetCard {
    // Only stack ids are ever listed in BEFORE_AFTER_IDS, so the Stack margin
    // ratio is always the right expectation here.
    const prevVertical = checkVerticalMargins(svg, MARGIN_RATIO, DEFAULT_VERTICAL_RATIO_PERCENT);
    const prevMinY = prevVertical.topMarginPx;
    const prevMaxY = POSTER_HEIGHT - prevVertical.bottomMarginPx;
    return {
      id,
      svg,
      shortCaption: `prev · ${Math.round(prevMaxY - prevMinY)}px`,
      fullCaption: 'previous run',
      inkTopPercent: pctOf(prevMinY, POSTER_HEIGHT),
      inkBottomPercent: pctOf(prevMaxY, POSTER_HEIGHT),
    };
  }

  const beforeAfter: SheetBeforeAfterRow[] = BEFORE_AFTER_IDS.map((id) => {
    const now = results.find((r) => r.id === id);
    if (!now) throw new Error(`before/after: case "${id}" not found`);
    const prevPath = path.join(prevDir, `${id}.svg`);
    const prevCard = fs.existsSync(prevPath) ? toPrevCard(id, fs.readFileSync(prevPath, 'utf8')) : null;
    return { id, now: toCard(now), prevCard };
  });

  fs.writeFileSync(path.join(outDir, 'index.html'), renderSheet(beforeAfter, groups), 'utf8');
}

const exitCode = exactFailures > 0 ? 1 : strict && toleranceViolations > 0 ? 1 : 0;
process.exit(exitCode);
