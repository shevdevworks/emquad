import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { POSTER_HEIGHT, POSTER_WIDTH, type PosterSpec } from '../lib/poster/types';
import { render } from '../lib/poster/render';
import { CASES } from './cases';
import {
  checkBleed,
  checkDeterminism,
  checkEdgeConvergence,
  checkParserSync,
  checkStructure,
  checkVerticalMargins,
  collectRows,
  countGlyphPaths,
  type ToleranceMetric,
} from './checks';
import { renderSheet, type SheetCard, type SheetGroup } from './sheet';

const DEFAULT_EDGE_CONVERGENCE_PERCENT = 0.5;
const DEFAULT_VERTICAL_PERCENT = 1;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const filterArg = args.find((a) => a.startsWith('--filter='));
const filter = filterArg ? filterArg.slice('--filter='.length) : undefined;

const selectedCases = filter ? CASES.filter((c) => c.id.includes(filter)) : CASES;

const outDir = path.resolve(process.cwd(), 'lab', 'out');
fs.mkdirSync(outDir, { recursive: true });

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

interface CaseResult {
  readonly id: string;
  readonly svg: string;
  readonly caption: string;
}

const results: CaseResult[] = [];
const hashes: Record<string, string> = {};
let exactFailures = 0;
let toleranceViolations = 0;

for (const labCase of selectedCases) {
  const svgA = render(labCase.spec);
  const svgB = render(labCase.spec);

  const structure = checkStructure(svgA);
  const determinism = checkDeterminism(svgA, svgB);
  const pathCount = countGlyphPaths(svgA);
  const parserSync = checkParserSync(svgA, pathCount);
  const rows = collectRows(svgA);

  const edgePercent = labCase.thresholds?.edgeConvergencePercent ?? DEFAULT_EDGE_CONVERGENCE_PERCENT;
  const verticalPercent = labCase.thresholds?.verticalPercent ?? DEFAULT_VERTICAL_PERCENT;

  const { left, right } = checkEdgeConvergence(rows, edgePercent);
  const vertical = checkVerticalMargins(svgA, verticalPercent);
  const bleed = checkBleed(svgA, labCase.allowBleed ?? false);

  const exactViolations = [...structure.violations, ...determinism.violations, ...parserSync.violations];
  const exactOk = exactViolations.length === 0;
  if (!exactOk) exactFailures++;

  const toleranceFails = [left.ok, right.ok, vertical.metric.ok, bleed.ok].filter((ok) => !ok).length;
  toleranceViolations += toleranceFails;

  fs.writeFileSync(path.join(outDir, `${labCase.id}.svg`), svgA, 'utf8');
  hashes[labCase.id] = crypto.createHash('sha256').update(svgA, 'utf8').digest('hex');

  const caption = formatCaption(labCase.spec);
  results.push({ id: labCase.id, svg: svgA, caption });

  const line = [
    exactOk ? '[PASS]' : '[FAIL]',
    labCase.id,
    `exact=${exactOk ? 'ok' : `FAIL:${exactViolations.join('; ')}`}`,
    `paths=${pathCount}`,
    `rows=${rows.length}`,
    fmtMetric('edge-left', left, POSTER_WIDTH),
    fmtMetric('edge-right', right, POSTER_WIDTH),
    `vertical(top=${vertical.topMarginPx.toFixed(2)} bottom=${vertical.bottomMarginPx.toFixed(2)} ${fmtMetric('diff', vertical.metric, POSTER_HEIGHT)})`,
    `bleed=${bleed.ok ? 'ok' : 'FAIL'}(${bleed.violationCount}/${bleed.maxOverflowPx.toFixed(2)}px)`,
  ].join(' ');
  console.log(line);
}

console.log(
  `\n${selectedCases.length} cases, ${exactFailures} exact failures, ${toleranceViolations} tolerance violations${strict ? ' (strict)' : ''}`,
);

if (!filter) {
  const sortedHashes = Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(outDir, 'hashes.json'), `${JSON.stringify(sortedHashes, null, 2)}\n`, 'utf8');

  const toCard = (r: CaseResult): SheetCard => ({ id: r.id, svg: r.svg, caption: r.caption });
  const grainCards = results.filter((r) => r.id.startsWith('grain-')).map(toCard);
  const allCards = results.map(toCard);

  const groups: SheetGroup[] = [
    { title: 'Grain', cards: grainCards },
    { title: 'Grain @ 504px OG crop', cards: grainCards, fixedCellWidthPx: 504 },
    { title: 'All cases', cards: allCards },
  ];

  fs.writeFileSync(path.join(outDir, 'index.html'), renderSheet(groups), 'utf8');
}

const exitCode = exactFailures > 0 ? 1 : strict && toleranceViolations > 0 ? 1 : 0;
process.exit(exitCode);
