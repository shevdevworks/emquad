import { DEFAULT_PARAMS, PARAMS_VERSION, type PosterSpec } from '@/lib/poster/types';
import {
  normalizePhrase,
  toAccent,
  toDensity,
  toGrain,
  toInvert,
  toMode,
  toSeed,
  validatePosterSpec,
} from '@/lib/poster/validate';

interface ShowcaseInput {
  readonly phrase: string;
  readonly mode: unknown;
  readonly density: unknown;
  readonly grain: unknown;
  readonly seed: unknown;
  readonly accent: unknown;
}

function buildComposition(input: ShowcaseInput): PosterSpec {
  const spec: PosterSpec = {
    phrase: normalizePhrase(input.phrase),
    params: {
      v: PARAMS_VERSION,
      mode: toMode(input.mode),
      invert: toInvert(DEFAULT_PARAMS.invert),
      accent: toAccent(input.accent),
      density: toDensity(input.density),
      grain: toGrain(input.grain),
      seed: toSeed(input.seed),
    },
  };

  const result = validatePosterSpec(spec);
  if (!result.ok) {
    throw new Error(`showcase-phrases: invalid composition "${input.phrase}": ${JSON.stringify(result.issues)}`);
  }

  return spec;
}

export const SHOWCASE_COMPOSITIONS: readonly PosterSpec[] = [
  buildComposition({
    phrase: 'TYPE IS A SYSTEM OF DECISIONS',
    mode: 'stack',
    density: 'regular',
    grain: 1,
    seed: 134002,
    accent: 3,
  }),
  buildComposition({
    phrase: 'EVERYTHING LOUD BECOMES NOISE',
    mode: 'break',
    density: 'tight',
    grain: 3,
    seed: 58210,
    accent: 3,
  }),
  buildComposition({
    phrase: 'FORM FOLLOWS THE HAND THAT MAKES IT',
    mode: 'grid',
    density: 'regular',
    grain: 1,
    seed: 77345,
    accent: 3,
  }),
  buildComposition({
    phrase: 'SILENCE IS ALSO A MATERIAL',
    mode: 'column',
    density: 'tight',
    grain: 0,
    seed: 9142,
    accent: 0,
  }),
  buildComposition({
    phrase: 'A CIRCLE HAS NO BEGINNING',
    mode: 'ring',
    density: 'regular',
    grain: 1,
    seed: 305519,
    accent: 1,
  }),
  buildComposition({
    phrase: 'NOTHING STAYS THE SAME FOREVER',
    mode: 'stack',
    density: 'airy',
    grain: 2,
    seed: 642877,
    accent: null,
  }),
] as const;
