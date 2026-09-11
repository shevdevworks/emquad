/**
 * Validates a set of /create addresses (normally seed/gallery.ts, loaded by
 * seed/gallery-checks.ts) strictly enough that a clean result guarantees
 * stage 7.3 can insert the resolved specs unmodified. Pure - no filesystem
 * access, no database access, nothing time-dependent, no node:* imports.
 * seed/check.ts and seed/gallery-sync.ts both call checkGalleryUrls so the
 * validation logic lives in exactly one place. This file has to stay clean
 * of node: imports, fs, path, url and process: it is reachable from
 * app/(fixed)/gallery/page.tsx, and a dynamic filesystem access anywhere in
 * that chain makes Turbopack trace the whole project into the server build
 * (seed/gallery-checks.ts used to do exactly that before the file split in
 * 7.4). It lives under lib/ rather than seed/ so the dependency runs
 * seed -> lib only: the application never imports out of seed/ for code,
 * only for the GALLERY_URLS data array.
 *
 * Every check below reuses the same code the editor and the Server Action
 * already use (searchParamsToSpec, specToSearchParams, normalizeParams,
 * validatePosterSpec) - this file never re-implements URL parsing or
 * parameter normalization.
 */
import type { PosterParams, PosterSpec } from '../poster/types';
import { normalizeParams, normalizePhrase, validatePosterSpec, type RawPosterParams } from '../poster/validate';
import { searchParamsToSpec, specToSearchParams } from '../poster/url';

export const MAX_RECORDS = 16;

const KNOWN_KEYS = ['phrase', 'mode', 'invert', 'accent', 'density', 'grain', 'seed'] as const;
const PARAM_FIELDS = ['v', 'mode', 'invert', 'accent', 'density', 'grain', 'seed'] as const satisfies readonly (keyof PosterParams)[];

export interface GalleryCheckResult {
  readonly errors: readonly string[];
  readonly specs: readonly PosterSpec[]; // only meaningful when errors is empty
}

function fail(errors: string[], index: number, message: string): void {
  errors.push(`record ${index}: ${message}`);
}

export function specsDeepEqual(a: PosterSpec, b: PosterSpec): boolean {
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

export function checkGalleryUrls(urls: readonly string[]): GalleryCheckResult {
  const errors: string[] = [];
  const rawSpecs: (PosterSpec | null)[] = urls.map((address, i) => checkRecord(i + 1, address, errors));

  for (let i = 0; i < rawSpecs.length; i++) {
    const a = rawSpecs[i];
    if (a === null) continue;
    for (let j = i + 1; j < rawSpecs.length; j++) {
      const b = rawSpecs[j];
      if (b !== null && specsDeepEqual(a, b)) {
        fail(errors, j + 1, `duplicates record ${i + 1}`);
      }
    }
  }

  if (urls.length > MAX_RECORDS) {
    errors.push(`${urls.length} records, maximum is ${MAX_RECORDS}`);
  }

  if (errors.length > 0) {
    return { errors, specs: [] };
  }

  const specs = rawSpecs.map((spec) => {
    if (spec === null) throw new Error('unreachable: a spec-less record produced no error');
    return spec;
  });

  return { errors: [], specs };
}
