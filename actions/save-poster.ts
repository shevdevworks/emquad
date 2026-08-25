'use server';

import { normalizePhrase, validatePosterSpec, type ValidationIssue } from '@/lib/poster/validate';
import { insertPoster } from '@/lib/db/queries';
import {
  DENSITIES,
  GRAIN_LEVELS,
  MODES,
  PARAMS_VERSION,
  type Density,
  type GrainLevel,
  type Mode,
  type PosterParams,
} from '@/lib/poster/types';

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

function toMode(value: unknown): Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
    ? (value as Mode) // narrowed by the .includes check above against MODES itself
    : 'break'; // any Mode other than 'stack' fails validateParams's availability check the same way
}

function toDensity(value: unknown): Density {
  return typeof value === 'string' && (DENSITIES as readonly string[]).includes(value)
    ? (value as Density) // narrowed by the .includes check above against DENSITIES itself
    : 'regular';
}

function toGrain(value: unknown): GrainLevel {
  return typeof value === 'number' && (GRAIN_LEVELS as readonly number[]).includes(value)
    ? (value as GrainLevel) // narrowed by the .includes check above against GRAIN_LEVELS itself
    : 1; // matches DEFAULT_PARAMS.grain
}

function toAccent(value: unknown): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isInteger(value) ? value : -1; // -1 always fails the [0, wordCount) range check
}

function toSeed(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : -1; // -1 always fails the [0, MAX_SEED] range check
}

function normalizeParams(raw: RawPosterParams): PosterParams {
  return {
    v: PARAMS_VERSION,
    mode: toMode(raw.mode),
    invert: Boolean(raw.invert),
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
  return { ok: true, code: row.code };
}
