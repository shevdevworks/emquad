import { POSTER_HEIGHT, POSTER_WIDTH, type Density, type GrainLevel } from '../types';
import onestGlyphs from '../onest-glyphs.json';

interface FontMetrics {
  readonly unitsPerEm: number;
  readonly capHeight: number;
  readonly ascender: number;
  readonly descender: number;
  readonly advances: Readonly<Record<string, number>>;
  readonly paths: Readonly<Record<string, string>>;
}

// The JSON import's inferred type has one literal property per glyph, with
// no generic string index signature, so arbitrary-character lookups need a
// wider type. The literal shape is verified by hand against the file's
// contents; this only widens the `advances`/`paths` index, it doesn't change
// any value.
const METRICS = onestGlyphs as unknown as Record<'500' | '800', FontMetrics>;

const DENSITY_METRICS: Record<Density, { marginX: number; marginY: number; gap: number }> = {
  tight: { marginX: 64, marginY: 96, gap: 8 },
  regular: { marginX: 96, marginY: 160, gap: 24 },
  airy: { marginX: 140, marginY: 260, gap: 56 },
};

const GRAIN_RECT_COUNT: Record<GrainLevel, number> = {
  0: 0,
  1: 220,
  2: 460,
  3: 820,
};

export interface StackColors {
  readonly ink: string;
  readonly accent: string;
}

export interface RenderStackInput {
  readonly words: readonly string[];
  readonly density: Density;
  readonly grain: GrainLevel;
  readonly seed: number;
  readonly accentIndex: number | null;
  readonly colors: StackColors;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wordNaturalWidth(word: string, advances: Readonly<Record<string, number>>): number {
  let width = 0;
  for (const char of word) {
    width += advances[char] ?? 500;
  }
  return width;
}

/**
 * Splits `widths.length` items into `groupCount` contiguous groups whose
 * summed widths are as close to equal as possible. Deterministic, single
 * left-to-right pass, no randomness: it recomputes the target width for the
 * remaining groups at each step and greedily extends the current group
 * while doing so keeps it closer to that target.
 */
function groupWords(widths: readonly number[], spaceWidth: number, groupCount: number): number[][] {
  if (groupCount >= widths.length) {
    return widths.map((_, i) => [i]);
  }

  const groups: number[][] = [];
  let i = 0;
  let remainingWidth = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * spaceWidth;

  for (let g = 0; g < groupCount; g++) {
    const remainingGroups = groupCount - g;
    if (remainingGroups === 1) {
      groups.push(widths.slice(i).map((_, k) => i + k));
      break;
    }

    const target = remainingWidth / remainingGroups;
    const group = [i];
    let groupWidth = widths[i];
    i++;

    while (i < widths.length) {
      const withNext = groupWidth + spaceWidth + widths[i];
      if (Math.abs(withNext - target) >= Math.abs(groupWidth - target)) break;
      groupWidth = withNext;
      group.push(i);
      i++;
    }

    groups.push(group);
    remainingWidth -= groupWidth + spaceWidth;
  }

  return groups;
}

interface RowWord {
  readonly index: number;
  readonly text: string;
  readonly naturalWidth: number;
}

interface Row {
  readonly words: readonly RowWord[];
  readonly fontSize: number;
  readonly rowHeight: number;
}

function buildRows(
  groups: readonly number[][],
  words: readonly string[],
  widths: readonly number[],
  spaceWidth: number,
  targetWidth: number,
  capHeight: number,
): Row[] {
  return groups.map((group) => {
    const rowWords: RowWord[] = group.map((index) => ({
      index,
      text: words[index],
      naturalWidth: widths[index],
    }));
    const rowNaturalWidth =
      rowWords.reduce((sum, w) => sum + w.naturalWidth, 0) + (rowWords.length - 1) * spaceWidth;
    const fontSize = (targetWidth * 1000) / rowNaturalWidth;
    const rowHeight = (fontSize * capHeight) / 1000;
    return { words: rowWords, fontSize, rowHeight };
  });
}

function blockHeightOf(rows: readonly Row[], gap: number): number {
  return rows.reduce((sum, row) => sum + row.rowHeight, 0) + gap * (rows.length - 1);
}

export function renderStack(input: RenderStackInput): string {
  const { density, grain, seed, accentIndex, colors } = input;
  const words = input.words.map((w) => w.toUpperCase());
  const { marginX, marginY, gap } = DENSITY_METRICS[density];
  const targetWidth = POSTER_WIDTH - 2 * marginX;
  const available = POSTER_HEIGHT - 2 * marginY;
  const metrics = METRICS['800'];
  const spaceWidth = metrics.advances[' '] ?? 500;
  const widths = words.map((w) => wordNaturalWidth(w, metrics.advances));

  let bestRows: Row[] | null = null;
  let bestBlockHeight = -Infinity;

  for (let l = 1; l <= words.length; l++) {
    const groups = groupWords(widths, spaceWidth, l);
    const rows = buildRows(groups, words, widths, spaceWidth, targetWidth, metrics.capHeight);
    const height = blockHeightOf(rows, gap);
    if (height <= available && height > bestBlockHeight) {
      bestRows = rows;
      bestBlockHeight = height;
    }
  }

  let rows: Row[];
  let blockHeight: number;

  if (bestRows !== null) {
    rows = bestRows;
    blockHeight = bestBlockHeight;
  } else {
    // Emergency fallback: not even the shortest possible arrangement (all
    // words on one row) fits. Force one word per row (the tallest, most
    // "stack"-like shape) and scale every row's font size down so the
    // fixed gaps plus the scaled row heights land exactly on `available`.
    const groups = groupWords(widths, spaceWidth, words.length);
    const naturalRows = buildRows(groups, words, widths, spaceWidth, targetWidth, metrics.capHeight);
    const naturalRowHeightSum = naturalRows.reduce((sum, row) => sum + row.rowHeight, 0);
    const k = (available - gap * (naturalRows.length - 1)) / naturalRowHeightSum;
    rows = naturalRows.map((row) => ({
      words: row.words,
      fontSize: row.fontSize * k,
      rowHeight: row.rowHeight * k,
    }));
    blockHeight = blockHeightOf(rows, gap);
  }

  const blockTop = (POSTER_HEIGHT - blockHeight) / 2;

  const textParts: string[] = [];
  let cursor = blockTop;

  for (const row of rows) {
    const baselineY = cursor + row.rowHeight;
    cursor += row.rowHeight + gap;

    const renderedWidths = row.words.map((w) => (w.naturalWidth * row.fontSize) / 1000);
    const renderedWidthSum = renderedWidths.reduce((a, b) => a + b, 0);
    const remainder = targetWidth - renderedWidthSum;
    const gapWidth = row.words.length > 1 ? remainder / (row.words.length - 1) : 0;

    const scale = row.fontSize / 1000;

    let x = marginX;
    for (let j = 0; j < row.words.length; j++) {
      const word = row.words[j];
      const renderedWidth = renderedWidths[j];
      const fill = word.index === accentIndex ? colors.accent : colors.ink;

      const glyphParts: string[] = [];
      let penX = x;
      for (const char of word.text) {
        const advance = metrics.advances[char] ?? 500;
        const path = metrics.paths[char];
        if (path !== undefined) {
          glyphParts.push(
            `<path d="${path}" transform="translate(${penX.toFixed(2)} ${baselineY.toFixed(2)}) scale(${scale.toFixed(6)})"/>`,
          );
        }
        penX += advance * scale;
      }
      textParts.push(`<g fill="${fill}">${glyphParts.join('')}</g>`);

      x += renderedWidth + gapWidth;
    }
  }

  const grainParts: string[] = [];
  const rectCount = GRAIN_RECT_COUNT[grain];
  if (rectCount > 0) {
    const rng = mulberry32(seed);
    for (let i = 0; i < rectCount; i++) {
      const gx = rng() * POSTER_WIDTH;
      const gy = rng() * POSTER_HEIGHT;
      const size = 1 + rng() * 2;
      const opacity = 0.05 + rng() * 0.13;
      grainParts.push(
        `<rect x="${gx.toFixed(2)}" y="${gy.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="${colors.ink}" fill-opacity="${opacity.toFixed(2)}"/>`,
      );
    }
  }

  return grainParts.join('') + textParts.join('');
}
