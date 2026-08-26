import onestGlyphs from './onest-glyphs.json';

interface FontMetrics {
  readonly unitsPerEm: number;
  readonly capHeight: number;
  readonly ascender: number;
  readonly descender: number;
  readonly advances: Readonly<Record<string, number>>;
  readonly paths: Readonly<Record<string, string>>;
}

// Same widening as modes/stack.ts: the JSON import's inferred type has one
// literal property per glyph, so arbitrary-character lookups need a wider
// type. Redeclared locally to keep this file independent of modes/stack.ts.
const METRICS = onestGlyphs as unknown as Record<'500' | '800', FontMetrics>;

export interface InkBounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export class UnsupportedPathCommandError extends Error {
  readonly command: string;

  constructor(command: string, context?: string) {
    super(`Unsupported SVG path command: "${command}"${context ? ` in ${context}` : ''}`);
    this.name = 'UnsupportedPathCommandError';
    this.command = command;
  }
}

export class NoGlyphPathError extends Error {
  constructor(weight: '500' | '800', char: string) {
    super(`No path for weight ${weight} char ${JSON.stringify(char)}`);
    this.name = 'NoGlyphPathError';
  }
}

const SUPPORTED_COMMANDS = new Set(['M', 'L', 'H', 'V', 'Q', 'Z']);

const TOKEN_RE = /[A-Za-z]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

const pathBoundsCache = new Map<string, InkBounds>();

/**
 * Exact extremum of a quadratic Bezier B(t) = (1-t)^2 p0 + 2(1-t)t p1 + t^2 p2
 * on one axis, or null if the curve has no interior extremum on that axis
 * (the axis is monotonic between p0 and p2, so the endpoints already cover it).
 */
function quadraticExtremum(p0: number, p1: number, p2: number): number | null {
  const denom = p0 - 2 * p1 + p2;
  if (denom === 0) return null;
  const t = (p0 - p1) / denom;
  if (t <= 0 || t >= 1) return null;
  const oneMinusT = 1 - t;
  return oneMinusT * oneMinusT * p0 + 2 * oneMinusT * t * p1 + t * t * p2;
}

/**
 * Ink bounding box of a raw SVG path `d` string, in the same units the path
 * data itself is expressed in (no normalization). Handles the exact command
 * set onest-glyphs.json uses: M L H V Q Z, all absolute, with M's implicit
 * repeated-pair-as-lineto grammar. Q's interior curve extremum is computed
 * exactly per axis rather than bounding the raw control point, since the
 * control point alone can overshoot the true curve by several px at real
 * poster font sizes. Cached by the literal `d` string.
 */
export function getPathInkBounds(d: string): InkBounds {
  const cached = pathBoundsCache.get(d);
  if (cached !== undefined) return cached;

  const tokens = d.match(TOKEN_RE) ?? [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let command = '';

  const extendX = (x: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  };
  const extendY = (y: number) => {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (/^[A-Za-z]$/.test(token)) {
      if (!SUPPORTED_COMMANDS.has(token)) {
        throw new UnsupportedPathCommandError(token);
      }
      command = token;
      i++;
      if (command === 'Z') {
        curX = startX;
        curY = startY;
      }
      continue;
    }

    switch (command) {
      case 'M':
      case 'L': {
        const x = Number(tokens[i]);
        const y = Number(tokens[i + 1]);
        curX = x;
        curY = y;
        extendX(x);
        extendY(y);
        if (command === 'M') {
          startX = x;
          startY = y;
          command = 'L'; // implicit repeats after M are linetos
        }
        i += 2;
        break;
      }
      case 'H': {
        curX = Number(tokens[i]);
        extendX(curX);
        i += 1;
        break;
      }
      case 'V': {
        curY = Number(tokens[i]);
        extendY(curY);
        i += 1;
        break;
      }
      case 'Q': {
        const cx = Number(tokens[i]);
        const cy = Number(tokens[i + 1]);
        const x = Number(tokens[i + 2]);
        const y = Number(tokens[i + 3]);
        const exX = quadraticExtremum(curX, cx, x);
        const exY = quadraticExtremum(curY, cy, y);
        if (exX !== null) extendX(exX);
        if (exY !== null) extendY(exY);
        extendX(x);
        extendY(y);
        curX = x;
        curY = y;
        i += 4;
        break;
      }
      default:
        throw new UnsupportedPathCommandError(command || token);
    }
  }

  const bounds: InkBounds = { x0: minX, y0: minY, x1: maxX, y1: maxY };
  pathBoundsCache.set(d, bounds);
  return bounds;
}

/**
 * Ink bounding box of a glyph, in thousandths of the type size (per-mille of
 * em), Y axis in the same screen-coordinate convention onest-glyphs.json
 * itself uses (not flipped). Thin wrapper over getPathInkBounds — caching
 * lives entirely at the `d`-string level, not here.
 */
export function getInkBounds(weight: '500' | '800', char: string): InkBounds {
  const metrics = METRICS[weight];
  const d = metrics.paths[char];
  if (d === undefined) {
    throw new NoGlyphPathError(weight, char);
  }

  let raw: InkBounds;
  try {
    raw = getPathInkBounds(d);
  } catch (err) {
    if (err instanceof UnsupportedPathCommandError) {
      throw new UnsupportedPathCommandError(err.command, `glyph ${JSON.stringify(char)}, weight ${weight}`);
    }
    throw err;
  }

  const factor = 1000 / metrics.unitsPerEm;
  return {
    x0: raw.x0 * factor,
    y0: raw.y0 * factor,
    x1: raw.x1 * factor,
    y1: raw.y1 * factor,
  };
}
