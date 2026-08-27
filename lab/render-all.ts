import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { DENSITIES, POSTER_HEIGHT, POSTER_WIDTH, type Density, type PosterSpec } from '../lib/poster/types';
import { render } from '../lib/poster/render';
import { MARGIN_RATIO } from '../lib/poster/modes/stack';
import { GIANT_MIN_INK_WIDTH_PX, MIN_GIANT_BLOCK_GAP_PX } from '../lib/poster/modes/break';
import { CELL, DENSITY_METRICS as GRID_DENSITY_METRICS, PADDING as GRID_PADDING } from '../lib/poster/modes/grid';
import { CASES } from './cases';
import {
  checkBleed,
  checkBlockLineSpacing,
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
  checkSingleSidedHorizontalBleed,
  checkStructure,
  checkVerticalMargins,
  collectGlyphScales,
  collectRows,
  countGlyphPaths,
  parseGridRects,
  splitGiantRow,
  splitGridRects,
  type ToleranceMetric,
  type VerticalMarginsResult,
} from './checks';
import { renderSheet, type SheetBeforeAfterRow, type SheetCard, type SheetGroup } from './sheet';

const DEFAULT_EDGE_CONVERGENCE_PERCENT = 0.5;
// Percent deviation of the bottom/top margin ratio tolerated from its
// expected value — generous relative to the ~0.001% drift toFixed rounding
// actually produces, so it catches formula regressions without ever being
// noisy on correct output. See checks.ts's checkVerticalMargins.
const DEFAULT_VERTICAL_RATIO_PERCENT = 2;

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
let exactFailures = 0;
let toleranceViolations = 0;

for (const labCase of selectedCases) {
  const isBreak = labCase.spec.params.mode === 'break';
  const isGrid = labCase.spec.params.mode === 'grid';
  const svgA = render(labCase.spec);
  const svgB = render(labCase.spec);

  const structure = checkStructure(svgA);
  const determinism = checkDeterminism(svgA, svgB);
  const pathCount = countGlyphPaths(svgA);
  const parserSync = checkParserSync(svgA, pathCount);
  const rows = collectRows(svgA);

  const edgePercent = labCase.thresholds?.edgeConvergencePercent ?? DEFAULT_EDGE_CONVERGENCE_PERCENT;
  const verticalPercent = labCase.thresholds?.verticalPercent ?? DEFAULT_VERTICAL_RATIO_PERCENT;

  // Grid has no page margins at all (the module grid runs to the canvas
  // edge), so - like Break - it has no margin-ratio invariant to check;
  // the measurement still runs, diagnostic-only.
  const vertical = checkVerticalMargins(svgA, isBreak || isGrid ? null : MARGIN_RATIO, verticalPercent);
  const bleed = checkBleed(svgA, labCase.allowBleed ?? false);

  const baseExactViolations = [...structure.violations, ...determinism.violations, ...parserSync.violations];

  let extraFields: string[];
  let toleranceChecks: boolean[];
  let gridExactViolations: string[] = [];

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

  const exactViolations = [...baseExactViolations, ...gridExactViolations];
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
    fmtVertical(vertical, isBreak || isGrid ? null : MARGIN_RATIO),
  ].join(' ');
  console.log(line);
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
