import { DENSITIES, DEFAULT_PARAMS, PARAMS_VERSION, type Density, type PosterSpec } from '../lib/poster/types';
import { splitWords } from '../lib/poster/validate';
import { FIXTURES } from '../lib/poster/fixtures';

// Percent-based, matching checks.ts's threshold parameters: edgeConvergencePercent
// is percent of canvas width, verticalPercent is percent deviation of the
// bottom/top margin ratio from its expected value (not px, and not a share
// of canvas height) — see checks.ts's checkVerticalMargins.
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
  overrides: Partial<Omit<PosterSpec['params'], 'v'>>,
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
// None of the words above are short enough to trip break.ts's giant height
// ceiling (verified numerically: shortest is "Тиша" at 4 chars, which stays
// well under the 18%-62% band at the nominal GIANT_WIDTH_RATIO font size).
// "Go" is a real 2-char word that does trip it.
const PHRASE_GO_SLOW = 'Go slow and stay weird';

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

const breakGeometryCases: LabCase[] = GEOMETRY_PHRASES.flatMap(({ slug, phrase, seed }) =>
  (DENSITIES as readonly Density[]).map((density) => ({
    id: `break-${slug}-${density}`,
    spec: spec(phrase, { mode: 'break', density, invert: false, accent: null, seed }),
    allowBleed: true,
  })),
);

const breakAccentCases: LabCase[] = [
  {
    // Default giant without accent is "forever" (index 2, 7 chars). accent:0
    // forces "Stay" instead — proves accent overrides the default rule.
    id: 'break-accent-giant-stay',
    spec: spec(PHRASE_STAY_WEIRD, { mode: 'break', density: 'regular', accent: 0, seed: 7 }),
    allowBleed: true,
  },
  {
    // Default giant without accent is "тримає" (index 1, 6 chars). accent:2
    // forces "форму" instead.
    id: 'break-accent-giant-formu',
    spec: spec(PHRASE_TISHA, { mode: 'break', density: 'regular', accent: 2, seed: 3 }),
    allowBleed: true,
  },
  {
    // "Go" (index 0, 2 chars), forced via accent. Exercises break.ts's
    // giant height ceiling: at the nominal GIANT_WIDTH_RATIO font size, a
    // word this short paints taller than the 18%-62% band, so the renderer
    // shrinks it to fit the band exactly — the giant ends up narrower than
    // the nominal width, and may not be cropped at all.
    id: 'break-accent-giant-short-go',
    spec: spec(PHRASE_GO_SLOW, { mode: 'break', density: 'regular', accent: 0, seed: 11 }),
    allowBleed: true,
  },
];

export const CASES: readonly LabCase[] = [
  ...fixtureCases,
  ...geometryCases,
  ...colorCases,
  ...grainCases,
  ...breakGeometryCases,
  ...breakAccentCases,
];
