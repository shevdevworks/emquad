'use server';

import { redirect } from 'next/navigation';
import {
  normalizeParams,
  normalizePhrase,
  validatePosterSpec,
  type RawPosterParams,
  type ValidationIssue,
} from '@/lib/poster/validate';
import { insertPoster } from '@/lib/db/queries';

export type SavePosterResult =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

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
