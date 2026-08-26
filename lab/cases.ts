import { DENSITIES, DEFAULT_PARAMS, PARAMS_VERSION, type Density, type PosterSpec } from '../lib/poster/types';
import { splitWords } from '../lib/poster/validate';
import { FIXTURES } from '../lib/poster/fixtures';

// Percent-based, matching checks.ts's threshold parameters (percent of
// canvas width/height), not px, so an override here can't silently mean a
// different unit than the default it's overriding.
export interface LabCaseThresholds {
  readonly edgeConvergencePercent?: number;
  readonly verticalPercent?: number;
}

export interface LabCase {
  readonly id: string;
  readonly spec: PosterSpec;
  readonly allowBleed?: boolean;
  readonly thresholds?: LabCaseThresholds;
}

function spec(
  phrase: string,
  overrides: Partial<Omit<PosterSpec['params'], 'v' | 'mode'>>,
): PosterSpec {
  return {
    phrase,
    params: {
      ...DEFAULT_PARAMS,
      v: PARAMS_VERSION,
      mode: 'stack',
      ...overrides,
    },
  };
}

const PHRASE_STAY_WEIRD = FIXTURES.demo1.phrase; // 'Stay weird forever' — MIN_WORDS boundary
const PHRASE_MAKE_MORE = FIXTURES.demo2.phrase; // 'Make more than you can ever use' — MAX_WORDS boundary
const PHRASE_TISHA = FIXTURES.demo4.phrase; // 'Тиша тримає форму' — Cyrillic coverage

const GEOMETRY_PHRASES: readonly { readonly slug: string; readonly phrase: string; readonly seed: number }[] = [
  { slug: 'stay-weird-forever', phrase: PHRASE_STAY_WEIRD, seed: 7 },
  { slug: 'make-more-than-you-can-ever-use', phrase: PHRASE_MAKE_MORE, seed: 42 },
  { slug: 'tisha-trymaye-formu', phrase: PHRASE_TISHA, seed: 3 },
];

function accentIndexFor(phrase: string): number {
  return Math.floor(splitWords(phrase).length / 2);
}

const fixtureCases: LabCase[] = (Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]).map((code) => ({
  id: `fixture-${code}`,
  spec: FIXTURES[code],
}));

const geometryCases: LabCase[] = GEOMETRY_PHRASES.flatMap(({ slug, phrase, seed }) =>
  (DENSITIES as readonly Density[]).map((density) => ({
    id: `geometry-${slug}-${density}`,
    spec: spec(phrase, { density, invert: false, accent: null, seed }),
  })),
);

const colorAccentIndex = accentIndexFor(PHRASE_STAY_WEIRD);

const colorCases: LabCase[] = [false, true].flatMap((invert) =>
  [null, colorAccentIndex].map((accent) => ({
    id: `color-${invert ? 'invert-on' : 'invert-off'}-${accent === null ? 'accent-off' : 'accent-on'}`,
    spec: spec(PHRASE_STAY_WEIRD, { density: 'regular', invert, accent, seed: 7 }),
  })),
);

const grainCases: LabCase[] = [0, 1, 2, 3].map((grain) => ({
  id: `grain-${grain}`,
  spec: spec(PHRASE_STAY_WEIRD, {
    density: FIXTURES.demo1.params.density,
    invert: FIXTURES.demo1.params.invert,
    accent: null,
    seed: FIXTURES.demo1.params.seed,
    grain: grain as 0 | 1 | 2 | 3,
  }),
}));

export const CASES: readonly LabCase[] = [...fixtureCases, ...geometryCases, ...colorCases, ...grainCases];
