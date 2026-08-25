import {
  AVAILABLE_MODES,
  MAX_CHARS,
  MAX_SEED,
  MAX_WORDS,
  MIN_WORDS,
  type PosterParams,
  type PosterSpec,
} from './types';

/**
 * Single canonical place a phrase is split into words. Every module that
 * needs the word list (validation, the stack mode) goes through this.
 */
export function splitWords(phrase: string): string[] {
  const trimmed = phrase.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
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
