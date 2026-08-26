'use server';

import { redirect } from 'next/navigation';
import {
  normalizePhrase,
  toAccent,
  toDensity,
  toGrain,
  toInvert,
  toMode,
  toSeed,
  validatePosterSpec,
  type ValidationIssue,
} from '@/lib/poster/validate';
import { insertPoster } from '@/lib/db/queries';
import { PARAMS_VERSION, type PosterParams } from '@/lib/poster/types';

export type SavePosterResult =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

// Shape a caller might send - nothing beyond "unknown" per field can be
// trusted, since this action is callable directly, bypassing the editor.
export interface RawPosterParams {
  readonly v?: unknown;
  readonly mode?: unknown;
  readonly invert?: unknown;
  readonly accent?: unknown;
  readonly density?: unknown;
  readonly grain?: unknown;
  readonly seed?: unknown;
}

function normalizeParams(raw: RawPosterParams): PosterParams {
  return {
    v: PARAMS_VERSION,
    mode: toMode(raw.mode),
    invert: toInvert(raw.invert),
    accent: toAccent(raw.accent),
    density: toDensity(raw.density),
    grain: toGrain(raw.grain),
    seed: toSeed(raw.seed),
  };
}

export async function savePoster(phrase: string, params: RawPosterParams): Promise<SavePosterResult> {
  // Reject oversized/malformed input before the per-character normalization pass -
  // this action is callable directly over the network, so `phrase` can't be trusted
  // to already be the short string the `string` type claims. 1000 is well above any
  // phrase that could pass the 40-char limit, but small enough to reject instantly.
  if (typeof phrase !== 'string' || phrase.length > 1000) {
    return { ok: false, issues: [{ field: 'phrase', code: 'too_long' }] };
  }

  const spec = { phrase: normalizePhrase(phrase), params: normalizeParams(params) };

  const validation = validatePosterSpec(spec);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  const row = await insertPoster(spec);
  redirect(`/p/${row.code}`);
}
