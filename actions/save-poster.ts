'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  normalizeParams,
  normalizePhrase,
  validatePosterSpec,
  type RawPosterParams,
  type ValidationIssue,
} from '@/lib/poster/validate';
import { findRecentDuplicate, insertPoster } from '@/lib/db/queries';
import { allowSave } from '@/lib/rate-limit';

export type SavePosterResult =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly reason: 'invalid'; readonly issues: readonly ValidationIssue[] }
  | { readonly ok: false; readonly reason: 'rate_limited' };

// x-forwarded-for holds the chain of proxies; the first entry is the client.
// A request that arrives without either header (a direct hit in development)
// falls into one shared bucket, which is the safe direction: it throttles
// more, never less.
async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const client = forwarded?.split(',')[0]?.trim();
  return client || headerList.get('x-real-ip') || 'unknown';
}

export async function savePoster(phrase: string, params: RawPosterParams): Promise<SavePosterResult> {
  // Throttle before validation so a flood of malformed calls is rejected on
  // the same budget as well-formed ones.
  if (!allowSave(await clientKey())) {
    return { ok: false, reason: 'rate_limited' };
  }

  // Reject oversized/malformed input before the per-character normalization pass -
  // this action is callable directly over the network, so `phrase` can't be trusted
  // to already be the short string the `string` type claims. 1000 is well above any
  // phrase that could pass the 40-char limit, but small enough to reject instantly.
  if (typeof phrase !== 'string' || phrase.length > 1000) {
    return { ok: false, reason: 'invalid', issues: [{ field: 'phrase', code: 'too_long' }] };
  }

  const spec = { phrase: normalizePhrase(phrase), params: normalizeParams(params) };

  const validation = validatePosterSpec(spec);
  if (!validation.ok) {
    return { ok: false, reason: 'invalid', issues: validation.issues };
  }

  const duplicate = await findRecentDuplicate(spec);
  if (duplicate !== null) {
    redirect(`/p/${duplicate.code}`);
  }

  const row = await insertPoster(spec);
  redirect(`/p/${row.code}`);
}
