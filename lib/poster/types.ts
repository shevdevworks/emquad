/**
 * Poster parameter model.
 *
 * This module is the single source of truth for everything a poster is made of.
 * It is imported by the renderer, the editor, the database layer and the
 * OG image route, so it must stay free of browser APIs, React and Node APIs.
 */

/**
 * Canonical poster canvas. The renderer always emits an SVG with this viewBox
 * and no fixed width/height, so consumers scale it freely.
 *
 * The aspect ratio is fixed on purpose: preview, poster page, download and
 * OG image all show the exact same composition. The OG card places this canvas
 * on a 1200x630 field rather than re-composing anything.
 */
export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

/** Bumped whenever the shape of PosterParams changes. Stored with every row. */
export const PARAMS_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Phrase                                                                     */
/* -------------------------------------------------------------------------- */

export const MIN_WORDS = 3;
export const MAX_WORDS = 7;
export const MAX_CHARS = 40;

/* -------------------------------------------------------------------------- */
/* Composition modes                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every mode must read as a different silhouette when the poster is blurred
 * down to blobs. See lib/poster/modes for the individual implementations.
 */
export const MODES = ['stack', 'break', 'grid', 'column', 'ring'] as const;

export type Mode = (typeof MODES)[number];

/**
 * Modes that currently have an implementation. The editor builds its controls
 * from this list, so shipping a new mode is a one-line change here.
 */
export const AVAILABLE_MODES = ['stack', 'break', 'grid', 'column', 'ring'] as const satisfies readonly Mode[];

export type AvailableMode = (typeof AVAILABLE_MODES)[number];

/* -------------------------------------------------------------------------- */
/* Knobs                                                                      */
/* -------------------------------------------------------------------------- */

/** Controls leading, margins and the amount of empty canvas. */
export const DENSITIES = ['tight', 'regular', 'airy'] as const;

export type Density = (typeof DENSITIES)[number];

/**
 * Grain is drawn as plain geometry, never as an SVG filter: the OG rasterizer
 * does not support filters, and the poster must be identical everywhere.
 * 0 means no grain.
 */
export const GRAIN_LEVELS = [0, 1, 2, 3] as const;

export type GrainLevel = (typeof GRAIN_LEVELS)[number];

export const MAX_SEED = 999_999;

/* -------------------------------------------------------------------------- */
/* Params                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Serialized as-is into the posters.params JSON column and into editor URLs.
 * Every field must be a JSON primitive: no dates, no undefined, no functions.
 */
export interface PosterParams {
  readonly v: typeof PARAMS_VERSION;
  readonly mode: Mode;
  /** Swaps ink and paper. */
  readonly invert: boolean;
  /** Index into the phrase words, or null when no word is highlighted. */
  readonly accent: number | null;
  readonly density: Density;
  readonly grain: GrainLevel;
  /**
   * Seeds every pseudo-random decision inside a mode. Without it the same
   * params would not produce the same poster twice, and the screen would
   * eventually disagree with the messenger preview.
   */
  readonly seed: number;
}

/** The complete input of the renderer: a phrase plus its parameters. */
export interface PosterSpec {
  readonly phrase: string;
  readonly params: PosterParams;
}

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

export const DEFAULT_PARAMS: PosterParams = {
  v: PARAMS_VERSION,
  mode: 'stack',
  invert: false,
  accent: null,
  density: 'regular',
  grain: 1,
  seed: 0,
};
