import { AVAILABLE_MODES, POSTER_HEIGHT, POSTER_WIDTH, type PosterSpec } from './types';
import { splitWords } from './validate';
import { renderStack } from './modes/stack';
import { renderBreak } from './modes/break';
import { renderGrid } from './modes/grid';
import { renderColumn } from './modes/column';
import { renderRing } from './modes/ring';

const PALETTE = {
  paper: '#000000',
  ink: '#FFFFFF',
  accent: '#3DDC97', // placeholder signal color, not swapped by invert
} as const;

export const ACCENT_COLOR = PALETTE.accent;

/** The poster's paper (background) color for a given spec, honoring invert. */
export function paperColorFor(spec: PosterSpec): string {
  return spec.params.invert ? PALETTE.ink : PALETTE.paper;
}

export function render(spec: PosterSpec): string {
  if (
    spec.params.mode !== 'stack' &&
    spec.params.mode !== 'break' &&
    spec.params.mode !== 'grid' &&
    spec.params.mode !== 'column' &&
    spec.params.mode !== 'ring'
  ) {
    throw new Error(
      `render(): mode "${spec.params.mode}" is not implemented (available: ${AVAILABLE_MODES.join(', ')})`,
    );
  }

  const words = splitWords(spec.phrase);

  // A spec normally arrives here having passed validatePosterSpec, but a row
  // written into the table by hand has not, and two shapes of bad input used
  // to escape as a raw TypeError from inside a mode: a phrase with no words
  // (stack, break, column and ring all indexed past the end of an empty list)
  // and an accent index pointing past the last word (break, column and ring
  // did the same).
  //
  // Neither branch can change a poster that renders today. Nothing is drawable
  // without a word, so an empty phrase is refused the way an unimplemented
  // mode is - tryRender turns that into a 404 rather than a 500. An
  // out-of-range accent falls back to no accent, which is byte-for-byte what
  // stack and grid already produced: both compare an index against the words
  // they placed, and an index that matches none of them highlights nothing,
  // exactly as null does.
  if (words.length === 0) {
    throw new Error('render(): the phrase has no words');
  }
  const accentIndex =
    spec.params.accent !== null && spec.params.accent >= 0 && spec.params.accent < words.length
      ? spec.params.accent
      : null;

  const paperColor = paperColorFor(spec);
  const inkColor = spec.params.invert ? PALETTE.paper : PALETTE.ink;

  const background = `<rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="${paperColor}"/>`;
  const modeInput = {
    words,
    density: spec.params.density,
    grain: spec.params.grain,
    seed: spec.params.seed,
    accentIndex,
    colors: { ink: inkColor, accent: PALETTE.accent, paper: paperColor },
  };
  const content =
    spec.params.mode === 'stack'
      ? renderStack(modeInput)
      : spec.params.mode === 'break'
        ? renderBreak(modeInput)
        : spec.params.mode === 'grid'
          ? renderGrid(modeInput)
          : spec.params.mode === 'column'
            ? renderColumn(modeInput)
            : renderRing(modeInput);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}">${background}${content}</svg>`;
}

/**
 * render() for callers that must not crash on a spec with no layout. A spec
 * can pass validatePosterSpec and still be unplaceable in its mode - grid
 * throws when a word is wider than the density's span ceiling, ring when its
 * type would drop below the legible minimum - and those limits live inside
 * the modes, not in the validator. Returns null in that case.
 */
export function tryRender(spec: PosterSpec): string | null {
  try {
    return render(spec);
  } catch {
    return null;
  }
}
