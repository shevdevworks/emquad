import { DEFAULT_PARAMS, type PosterParams, type PosterSpec } from './types';
import {
  normalizePhrase,
  splitWords,
  toAccent,
  toDensity,
  toGrain,
  toInvert,
  toMode,
  toSeed,
  validateParams,
  validatePhrase,
} from './validate';

export const DEFAULT_SPEC: PosterSpec = {
  phrase: 'the poster starts here',
  params: DEFAULT_PARAMS,
};

export function specToSearchParams(spec: PosterSpec): URLSearchParams {
  const params = new URLSearchParams();

  if (spec.phrase !== DEFAULT_SPEC.phrase) {
    params.set('phrase', spec.phrase);
  }
  if (spec.params.mode !== DEFAULT_PARAMS.mode) {
    params.set('mode', spec.params.mode);
  }
  if (spec.params.invert !== DEFAULT_PARAMS.invert) {
    params.set('invert', String(spec.params.invert));
  }
  if (spec.params.accent !== DEFAULT_PARAMS.accent) {
    params.set('accent', String(spec.params.accent));
  }
  if (spec.params.density !== DEFAULT_PARAMS.density) {
    params.set('density', spec.params.density);
  }
  if (spec.params.grain !== DEFAULT_PARAMS.grain) {
    params.set('grain', String(spec.params.grain));
  }
  if (spec.params.seed !== DEFAULT_PARAMS.seed) {
    params.set('seed', String(spec.params.seed));
  }

  return params;
}

export function searchParamsToSpec(params: URLSearchParams): PosterSpec {
  const phraseRaw = params.get('phrase');
  const phraseCandidate = phraseRaw === null ? DEFAULT_SPEC.phrase : normalizePhrase(phraseRaw);
  const phrase = validatePhrase(phraseCandidate).ok ? phraseCandidate : DEFAULT_SPEC.phrase;
  const wordCount = splitWords(phrase).length;

  const candidateParams: PosterParams = {
    v: DEFAULT_PARAMS.v,
    mode: toMode(params.get('mode')),
    invert: toInvert(params.get('invert')),
    accent: toAccent(params.get('accent')),
    density: toDensity(params.get('density')),
    grain: toGrain(params.get('grain')),
    seed: toSeed(params.get('seed')),
  };

  const result = validateParams(candidateParams, wordCount);
  if (result.ok) {
    return { phrase, params: candidateParams };
  }

  const badFields = new Set(result.issues.map((issue) => issue.field));
  const fixedParams: PosterParams = {
    ...candidateParams,
    mode: badFields.has('mode') ? DEFAULT_PARAMS.mode : candidateParams.mode,
    accent: badFields.has('accent') ? DEFAULT_PARAMS.accent : candidateParams.accent,
    seed: badFields.has('seed') ? DEFAULT_PARAMS.seed : candidateParams.seed,
  };

  return { phrase, params: fixedParams };
}
