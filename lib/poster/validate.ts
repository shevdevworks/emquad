import {
  AVAILABLE_MODES,
  DEFAULT_PARAMS,
  DENSITIES,
  GRAIN_LEVELS,
  MAX_CHARS,
  MAX_SEED,
  MAX_WORDS,
  MIN_WORDS,
  MODES,
  type Density,
  type GrainLevel,
  type Mode,
  type PosterParams,
  type PosterSpec,
} from './types';

/**
 * Single canonical place a phrase is cleaned before validation or storage.
 * Drops format/control characters (zero-width space, ZWJ/ZWNJ, BOM, C0
 * control codes) entirely, except the ones that are also regular whitespace
 * (tab, LF, CR, FF, VT), which collapse into a single ordinary space instead.
 */
export function normalizePhrase(phrase: string): string {
  const visibleOnly = Array.from(phrase)
    .filter((ch) => !/\p{Cf}|\p{Cc}/u.test(ch) || /\s/.test(ch))
    .join('');
  return visibleOnly.replace(/\s+/g, ' ').trim();
}

/**
 * Single canonical place a phrase is split into words. Every module that
 * needs the word list (validation, the stack mode) goes through this.
 */
export function splitWords(phrase: string): string[] {
  const trimmed = phrase.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

/**
 * Single canonical place every PosterParams field is coerced from untrusted
 * input (a Server Action's raw argument, or a string pulled out of
 * URLSearchParams). DEFAULT_PARAMS is the only fallback source - no literal
 * stands in for a default value anywhere below.
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return NaN;
}

export function toInvert(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  return DEFAULT_PARAMS.invert; // covers the string 'false' too - it must not become true
}

export function toMode(value: unknown): Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
    ? (value as Mode) // narrowed by the .includes check above against MODES itself
    : DEFAULT_PARAMS.mode;
}

export function toDensity(value: unknown): Density {
  return typeof value === 'string' && (DENSITIES as readonly string[]).includes(value)
    ? (value as Density) // narrowed by the .includes check above against DENSITIES itself
    : DEFAULT_PARAMS.density;
}

export function toGrain(value: unknown): GrainLevel {
  const n = toNumber(value);
  return (GRAIN_LEVELS as readonly number[]).includes(n)
    ? (n as GrainLevel) // narrowed by the .includes check above against GRAIN_LEVELS itself
    : DEFAULT_PARAMS.grain;
}

export function toAccent(value: unknown): number | null {
  if (value === null) return DEFAULT_PARAMS.accent;
  const n = toNumber(value);
  return Number.isInteger(n) ? n : -1; // -1 always fails validateParams's range check, triggering fallback
}

export function toSeed(value: unknown): number {
  const n = toNumber(value);
  return Number.isInteger(n) ? n : -1; // -1 always fails validateParams's range check, triggering fallback
}

export type ValidationIssue =
  | { readonly field: 'phrase'; readonly code: 'too_few_words' | 'too_many_words' | 'too_long' }
  | { readonly field: 'mode'; readonly code: 'unavailable_mode' }
  | { readonly field: 'accent'; readonly code: 'accent_out_of_range' }
  | { readonly field: 'seed'; readonly code: 'seed_not_integer' | 'seed_out_of_range' };

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function ok(): ValidationResult {
  return { ok: true };
}

function fail(issues: readonly ValidationIssue[]): ValidationResult {
  return { ok: false, issues };
}

export function validatePhrase(phrase: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (phrase.trim().length > MAX_CHARS) {
    issues.push({ field: 'phrase', code: 'too_long' });
  }

  const wordCount = splitWords(phrase).length;
  if (wordCount < MIN_WORDS) {
    issues.push({ field: 'phrase', code: 'too_few_words' });
  } else if (wordCount > MAX_WORDS) {
    issues.push({ field: 'phrase', code: 'too_many_words' });
  }

  return issues.length === 0 ? ok() : fail(issues);
}

export function validateParams(params: PosterParams, wordCount: number): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!AVAILABLE_MODES.some((mode) => mode === params.mode)) {
    issues.push({ field: 'mode', code: 'unavailable_mode' });
  }

  if (
    params.accent !== null &&
    (!Number.isInteger(params.accent) || params.accent < 0 || params.accent >= wordCount)
  ) {
    issues.push({ field: 'accent', code: 'accent_out_of_range' });
  }

  if (!Number.isInteger(params.seed)) {
    issues.push({ field: 'seed', code: 'seed_not_integer' });
  } else if (params.seed < 0 || params.seed > MAX_SEED) {
    issues.push({ field: 'seed', code: 'seed_out_of_range' });
  }

  return issues.length === 0 ? ok() : fail(issues);
}

export function validatePosterSpec(spec: PosterSpec): ValidationResult {
  const wordCount = splitWords(spec.phrase).length;
  const phraseResult = validatePhrase(spec.phrase);
  const paramsResult = validateParams(spec.params, wordCount);

  const issues: ValidationIssue[] = [
    ...(phraseResult.ok ? [] : phraseResult.issues),
    ...(paramsResult.ok ? [] : paramsResult.issues),
  ];

  return issues.length === 0 ? ok() : fail(issues);
}
