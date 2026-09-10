/**
 * gallery:plan / gallery:apply - stage 7.3.
 *
 * Reads the 16 accepted /create addresses from seed/gallery.ts (via the
 * same checks seed/check.ts uses), compares them against the production
 * `posters` table, and reports what stands between the current database
 * and the accepted set: which of the 16 still need inserting, which of a
 * fixed list of 17 leftover test/dev codes still exist, and a handful of
 * one-off debt reports (7.1's debt 56 pairs, byte-for-byte render
 * persistence).
 *
 * Plan mode (no flag) only ever reads. Apply mode (--apply) runs the same
 * read first, then - only if nothing looks wrong - inserts whatever of the
 * 16 is missing and deletes whatever of the 17 fixed codes remains.
 *
 * Importing lib/db/queries below does not itself touch the network -
 * getDb() there is a lazy singleton that only connects on first call - so
 * the static import doesn't violate "no database access before the
 * checks below run". No function from it is called until after
 * checkGalleryUrls has passed.
 *
 * No checks here duplicate seed/gallery-checks.ts; no insert path here
 * bypasses insertPoster in lib/db/queries.ts.
 */
import {
  countPosters,
  deletePostersByCode,
  getPosterByCode,
  insertPoster,
  listGalleryPosters,
  posterSpecFromRow,
} from '../lib/db/queries';
import type { PosterRow } from '../lib/db/schema';
import { render } from '../lib/poster/render';
import type { PosterSpec } from '../lib/poster/types';
import { checkGalleryUrls, loadGalleryUrls, specsDeepEqual } from './gallery-checks';
import { parseSyncArgs } from './sync-args';

const CODES_TO_DELETE: readonly string[] = [
  'vuappmre',
  'up4hrme3',
  '3ewbs8mt',
  '2qsa6eqa',
  '2dm5k5kp',
  'xnxxkbh9',
  'bvnn9tv7',
  'wvdcrs3x',
  'kbceycus',
  'tcc27v7f',
  'uz43a595',
  'x4vztydt',
  'evtpdbnm',
  'j2x3xh2v',
  'b3tydbdm',
  'mp693xfb',
  'q2satcyu',
];

const PAIRS_TO_COMPARE: readonly (readonly [string, string])[] = [
  ['3ewbs8mt', '2qsa6eqa'],
  ['mp693xfb', 'q2satcyu'],
];

function sanitizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : undefined;
  const url = process.env.DATABASE_URL;
  if (!url) return code ? `database error (${code})` : 'database error';
  try {
    const parsed = new URL(url);
    let cleaned = raw;
    for (const secret of [parsed.password, parsed.username, parsed.hostname, parsed.pathname.replace(/^\//, '')]) {
      if (secret) cleaned = cleaned.split(secret).join('[redacted]');
    }
    return code ? `${cleaned} (${code})` : cleaned;
  } catch {
    return code ? `database error (${code})` : 'database error';
  }
}

interface MatchResult {
  readonly alreadyInDb: readonly { readonly spec: PosterSpec; readonly row: PosterRow }[];
  readonly toInsert: readonly PosterSpec[];
  readonly unmatchedGalleryRows: readonly PosterRow[];
  readonly duplicateMatches: readonly { readonly specIndex: number; readonly codes: readonly string[] }[];
}

/**
 * One-to-one matching between the accepted specs and the current
 * inGallery=true rows: every row is claimed by at most one spec. A spec
 * matching zero rows needs inserting; a spec matching more than one row
 * is a duplicate-insert anomaly; a row matching no spec is an orphan
 * gallery row. Two distinct specs matching the same row can't happen -
 * checkGalleryUrls already rejects duplicate specs within the set.
 */
function matchSpecsToRows(specs: readonly PosterSpec[], galleryRows: readonly PosterRow[]): MatchResult {
  const alreadyInDb: { spec: PosterSpec; row: PosterRow }[] = [];
  const toInsert: PosterSpec[] = [];
  const duplicateMatches: { specIndex: number; codes: string[] }[] = [];
  const matchedRowIds = new Set<string>();

  specs.forEach((spec, i) => {
    const matches = galleryRows.filter((row) => specsDeepEqual(posterSpecFromRow(row), spec));
    if (matches.length === 0) {
      toInsert.push(spec);
      return;
    }
    if (matches.length > 1) {
      duplicateMatches.push({ specIndex: i + 1, codes: matches.map((r) => r.code) });
    }
    alreadyInDb.push({ spec, row: matches[0] });
    for (const row of matches) matchedRowIds.add(row.id);
  });

  const unmatchedGalleryRows = galleryRows.filter((row) => !matchedRowIds.has(row.id));

  return { alreadyInDb, toInsert, unmatchedGalleryRows, duplicateMatches };
}

async function runPlan(specs: readonly PosterSpec[]): Promise<{
  readonly toInsert: readonly PosterSpec[];
  readonly hasAnomalies: boolean;
  readonly codesInGalleryAmongTheSeventeen: readonly string[];
}> {
  const galleryRows = await listGalleryPosters();
  const total = await countPosters();
  const match = matchSpecsToRows(specs, galleryRows);

  console.log(`${match.alreadyInDb.length} of ${specs.length} in database, all inGallery true`);
  console.log(`to insert: ${match.toInsert.length}`);
  console.log(`total rows in posters: ${total}`);
  console.log(`rows with inGallery true: ${galleryRows.length}`);
  if (match.unmatchedGalleryRows.length > 0) {
    console.log(`unmatched gallery rows: ${match.unmatchedGalleryRows.map((r) => r.code).join(', ')}`);
  }
  for (const dup of match.duplicateMatches) {
    console.log(`duplicate matches: spec #${dup.specIndex} -> codes ${dup.codes.join(', ')}`);
  }

  const codeExistence = await Promise.all(
    CODES_TO_DELETE.map(async (code) => ({ code, row: await getPosterByCode(code) })),
  );
  const stillExisting = codeExistence.filter((e) => e.row !== null);
  console.log(`of ${CODES_TO_DELETE.length} codes, ${stillExisting.length} still exist`);
  if (stillExisting.length > 0) {
    console.log(`still existing: ${stillExisting.map((e) => e.code).join(', ')}`);
  }
  const codesInGalleryAmongTheSeventeen = stillExisting.filter((e) => e.row?.inGallery === true).map((e) => e.code);
  if (codesInGalleryAmongTheSeventeen.length > 0) {
    console.log(`skipped (in gallery): ${codesInGalleryAmongTheSeventeen.join(', ')}`);
  }

  for (const [codeA, codeB] of PAIRS_TO_COMPARE) {
    const rowA = await getPosterByCode(codeA);
    const rowB = await getPosterByCode(codeB);
    if (rowA && rowB) {
      const equal = specsDeepEqual(posterSpecFromRow(rowA), posterSpecFromRow(rowB));
      console.log(`pair ${codeA}/${codeB}: phrase+params match: ${equal ? 'yes' : 'no'}`);
    } else {
      console.log(`pair ${codeA}/${codeB}: not both in database`);
    }
  }

  let renderMatches = 0;
  for (const { spec, row } of match.alreadyInDb) {
    if (render(posterSpecFromRow(row)) === render(spec)) renderMatches++;
  }
  console.log(`render matches: ${renderMatches} of ${match.alreadyInDb.length}`);

  const hasAnomalies = match.unmatchedGalleryRows.length > 0 || match.duplicateMatches.length > 0;

  return { toInsert: match.toInsert, hasAnomalies, codesInGalleryAmongTheSeventeen };
}

async function main(): Promise<void> {
  const mode = parseSyncArgs(process.argv.slice(2));
  if (mode.kind === 'error') {
    console.error(mode.message);
    process.exitCode = 1;
    return;
  }

  const urls = await loadGalleryUrls();
  const { errors, specs } = checkGalleryUrls(urls);

  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
    return;
  }

  process.loadEnvFile('.env.local');

  const { toInsert, hasAnomalies, codesInGalleryAmongTheSeventeen } = await runPlan(specs);

  if (mode.kind !== 'apply') return;

  if (hasAnomalies || codesInGalleryAmongTheSeventeen.length > 0) {
    console.error('apply refused: anomalies above need the operator to resolve them first');
    process.exitCode = 1;
    return;
  }

  if (toInsert.length > 0) {
    try {
      for (const spec of toInsert) {
        await insertPoster(spec, { inGallery: true });
      }
    } catch (error) {
      console.error(sanitizeError(error));
      process.exitCode = 1;
      return;
    }
  }

  const galleryRowsAfterInsert = await listGalleryPosters();
  const rematch = matchSpecsToRows(specs, galleryRowsAfterInsert);
  if (rematch.toInsert.length > 0) {
    console.error(`insert incomplete, still missing ${rematch.toInsert.length} of ${specs.length} - delete skipped`);
    process.exitCode = 1;
    return;
  }

  const deleted = await deletePostersByCode(CODES_TO_DELETE);
  console.log(`deleted ${deleted.length} of ${CODES_TO_DELETE.length} codes`);
  console.log('done');
}

void main();
