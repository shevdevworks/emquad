import { AVAILABLE_MODES, POSTER_HEIGHT, POSTER_WIDTH, type PosterSpec } from './types';
import { splitWords } from './validate';
import { renderStack } from './modes/stack';
import { renderBreak } from './modes/break';

const PALETTE = {
  paper: '#000000',
  ink: '#FFFFFF',
  accent: '#FF3B2F', // placeholder signal color, not swapped by invert
} as const;

export function render(spec: PosterSpec): string {
  if (spec.params.mode !== 'stack' && spec.params.mode !== 'break') {
    throw new Error(
      `render(): mode "${spec.params.mode}" is not implemented (available: ${AVAILABLE_MODES.join(', ')})`,
    );
  }

  const words = splitWords(spec.phrase);
  const paperColor = spec.params.invert ? PALETTE.ink : PALETTE.paper;
  const inkColor = spec.params.invert ? PALETTE.paper : PALETTE.ink;

  const background = `<rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="${paperColor}"/>`;
  const modeInput = {
    words,
    density: spec.params.density,
    grain: spec.params.grain,
    seed: spec.params.seed,
    accentIndex: spec.params.accent,
    colors: { ink: inkColor, accent: PALETTE.accent },
  };
  const content = spec.params.mode === 'stack' ? renderStack(modeInput) : renderBreak(modeInput);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}">${background}${content}</svg>`;
}
