import { PARAMS_VERSION, type PosterSpec } from './types';

export type FixtureCode = 'demo1' | 'demo2' | 'demo3' | 'demo4';

export const FIXTURES: Record<FixtureCode, PosterSpec> = {
  demo1: {
    phrase: 'Stay weird forever',
    params: {
      v: PARAMS_VERSION,
      mode: 'stack',
      invert: false,
      accent: null,
      density: 'regular',
      grain: 2,
      seed: 7,
    },
  },
  demo2: {
    phrase: 'Make more than you can ever use',
    params: {
      v: PARAMS_VERSION,
      mode: 'stack',
      invert: true,
      accent: 4,
      density: 'tight',
      grain: 3,
      seed: 42,
    },
  },
  demo3: {
    phrase: 'Slow down and look closer',
    params: {
      v: PARAMS_VERSION,
      mode: 'stack',
      invert: false,
      accent: 3,
      density: 'airy',
      grain: 0,
      seed: 101,
    },
  },
  demo4: {
    phrase: 'Тиша тримає форму',
    params: {
      v: PARAMS_VERSION,
      mode: 'stack',
      invert: false,
      accent: 2,
      density: 'regular',
      grain: 1,
      seed: 3,
    },
  },
};
