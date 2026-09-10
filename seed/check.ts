/**
 * Validates the /create addresses in seed/gallery.ts (or, for testing only,
 * the file given as the first CLI argument) strictly enough that a clean
 * run guarantees stage 7.3 can insert them unmodified. Writes nothing to
 * the database - lab/gallery/index.html is the only output, a contact
 * sheet for eyeballing the set before it goes anywhere near production.
 *
 * Every check below reuses the same code the editor and the Server Action
 * already use (searchParamsToSpec, specToSearchParams, normalizeParams,
 * validatePosterSpec) - this file never re-implements URL parsing or
 * parameter normalization.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { MODES, type PosterParams, type PosterSpec } from '../lib/poster/types';
import { normalizeParams, normalizePhrase, validatePosterSpec, type RawPosterParams } from '../lib/poster/validate';
import { render } from '../lib/poster/render';
import { searchParamsToSpec, specToSearchParams } from '../lib/poster/url';

const KNOWN_KEYS = ['phrase', 'mode', 'invert', 'accent', 'density', 'grain', 'seed'] as const;
const PARAM_FIELDS = ['v', 'mode', 'invert', 'accent', 'density', 'grain', 'seed'] as const satisfies readonly (keyof PosterParams)[];
const MAX_RECORDS = 16;

function fail(errors: string[], index: number, message: string): void {
  errors.push(`record ${index}: ${message}`);
}

async function loadGalleryUrls(): Promise<readonly string[]> {
  const argPath = process.argv[2];
  const filePath = argPath
    ? path.resolve(process.cwd(), argPath)
    : path.resolve(process.cwd(), 'seed', 'gallery.ts');
  const mod = (await import(pathToFileURL(filePath).href)) as { GALLERY_URLS: readonly string[] };
  return mod.GALLERY_URLS;
}

function specsDeepEqual(a: PosterSpec, b: PosterSpec): boolean {
  if (a.phrase !== b.phrase) return false;
  return PARAM_FIELDS.every((field) => a.params[field] === b.params[field]);
}

/**
 * Checks one address end to end and returns the PosterSpec it resolves to
 * (even when errors were recorded for it - the run fails overall regardless,
 * this just lets duplicate detection still compare it). Returns null only
 * when the address couldn't be parsed at all, since no spec can be built
 * without at least a URL and a /create path.
 */
function checkRecord(index: number, address: string, errors: string[]): PosterSpec | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    fail(errors, index, `invalid address: ${address}`);
    return null;
  }

  if (url.pathname !== '/create') {
    fail(errors, index, `address path is '${url.pathname}', expected '/create'`);
    return null;
  }

  const seenKeys = new Set<string>();
  for (const [key] of url.searchParams.entries()) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
      fail(errors, index, `unknown key '${key}' in address`);
    }
    if (seenKeys.has(key)) {
      fail(errors, index, `duplicate key '${key}' in address`);
    }
    seenKeys.add(key);
  }

  const rawPhrase = url.searchParams.get('phrase');
  if (rawPhrase === null) {
    fail(errors, index, 'phrase is missing from the address');
  }

  // Same parser the editor uses on load (app/create/page.tsx).
  const spec = searchParamsToSpec(url.searchParams);

  // Round trip through the one and only URL writer. Any field the editor
  // would silently replace (an unrecognized mode, invert=TRUE, grain=9, a
  // phrase that needed whitespace cleanup, a phrase/params combination the
  // validator rejected and searchParamsToSpec quietly defaulted) shows up
  // here as a mismatch - including a key explicitly set to its own default
  // value, since the real writeUrl() never emits one.
  const canonical = specToSearchParams(spec);
  for (const key of KNOWN_KEYS) {
    const original = url.searchParams.get(key);
    const rewritten = canonical.get(key);
    if (original !== rewritten) {
      const originalText = original === null ? 'absent' : `'${original}'`;
      const rewrittenText = rewritten === null ? 'absent (this is the default)' : `'${rewritten}'`;
      fail(errors, index, `field '${key}': address has ${originalText}, the editor would write ${rewrittenText}`);
    }
  }

  // Same normalization the Server Action applies, run on the raw address
  // values, to surface the exact validation code (word count, range, etc.)
  // rather than just "it doesn't round-trip".
  const rawParams: RawPosterParams = {
    mode: url.searchParams.get('mode'),
    invert: url.searchParams.get('invert'),
    accent: url.searchParams.get('accent'),
    density: url.searchParams.get('density'),
    grain: url.searchParams.get('grain'),
    seed: url.searchParams.get('seed'),
  };
  const phraseForValidation = rawPhrase === null ? '' : normalizePhrase(rawPhrase);
  const validation = validatePosterSpec({ phrase: phraseForValidation, params: normalizeParams(rawParams) });
  if (!validation.ok) {
    for (const issue of validation.issues) {
      // toSeed(null) has no "absent means default" shortcut the way toAccent
      // does - it returns the same -1 sentinel for a missing key as for a
      // garbage one, which validateParams then flags as seed_out_of_range.
      // A missing seed is normal (it means the default), so that specific
      // combination is not a real error; a present-but-invalid seed still is.
      if (issue.field === 'seed' && url.searchParams.get('seed') === null) continue;
      fail(errors, index, `field '${issue.field}': ${issue.code}`);
    }
  }

  // Invariant: the spec the sheet renders must be exactly what stage 7.3's
  // insert path (normalizePhrase + normalizeParams) would produce from it.
  // Both are idempotent on already-valid input by construction, so this is
  // not expected to ever fire - if it does, that's a real bug to report,
  // not a reason to loosen the comparison.
  const renormalizedPhrase = normalizePhrase(spec.phrase);
  if (renormalizedPhrase !== spec.phrase) {
    fail(errors, index, "invariant broken: field 'phrase' does not survive re-normalization");
  }
  const renormalizedParams = normalizeParams(spec.params);
  for (const field of PARAM_FIELDS) {
    if (renormalizedParams[field] !== spec.params[field]) {
      fail(errors, index, `invariant broken: field '${field}' does not survive re-normalization`);
    }
  }

  return spec;
}

function buildSheetHtml(specs: readonly PosterSpec[]): string {
  const total = specs.length;
  const invertedCount = specs.filter((spec) => spec.params.invert).length;
  const modeCounts = MODES.map((mode) => `${mode}: ${specs.filter((spec) => spec.params.mode === mode).length}`);
  const summary = `${total} records — ${modeCounts.join(', ')} — inverted: ${invertedCount}`;

  const cardsHtml = specs
    .map((spec, i) => {
      const caption = `#${i + 1} · ${spec.params.mode} · ${spec.params.density} · ${spec.params.invert ? 'invert' : 'normal'}`;
      return `<div class="card"><div class="card-frame">${render(spec)}</div><div class="caption">${escapeHtml(caption)}</div></div>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Gallery contact sheet</title>
<style>
  * { box-sizing: border-box; }
  body { background: #000; color: #8A9299; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; }
  .summary { font-size: 12px; letter-spacing: 0.05em; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .card-frame { background: #111; border: 1px solid #222; aspect-ratio: 1080 / 1350; overflow: hidden; }
  .card-frame svg { width: 100%; height: 100%; display: block; }
  .caption { margin-top: 6px; font-size: 11px; letter-spacing: 0.05em; color: #8A9299; }
</style>
</head>
<body>
  <div class="summary">${escapeHtml(summary)}</div>
  <div class="grid">${cardsHtml}</div>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function main(): Promise<void> {
  const urls = await loadGalleryUrls();
  const outDir = path.resolve(process.cwd(), 'lab', 'gallery');
  const outFile = path.join(outDir, 'index.html');

  const errors: string[] = [];
  const specs: (PosterSpec | null)[] = urls.map((address, i) => checkRecord(i + 1, address, errors));

  for (let i = 0; i < specs.length; i++) {
    const a = specs[i];
    if (a === null) continue;
    for (let j = i + 1; j < specs.length; j++) {
      const b = specs[j];
      if (b !== null && specsDeepEqual(a, b)) {
        fail(errors, j + 1, `duplicates record ${i + 1}`);
      }
    }
  }

  if (urls.length > MAX_RECORDS) {
    errors.push(`${urls.length} records, maximum is ${MAX_RECORDS}`);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });
    process.exitCode = 1;
    return;
  }

  const validSpecs = specs.map((spec) => {
    if (spec === null) throw new Error('unreachable: a spec-less record produced no error');
    return spec;
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, buildSheetHtml(validSpecs), 'utf8');

  console.log(`${urls.length} of ${MAX_RECORDS}`);
}

void main();
