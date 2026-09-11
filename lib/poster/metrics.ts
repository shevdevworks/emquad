/**
 * The one place onest-glyphs.json is given a usable type. Every mode and
 * glyph-bounds.ts read the font through this module.
 *
 * It is a file of its own rather than part of primitives.ts because
 * primitives.ts imports glyph-bounds.ts, and glyph-bounds.ts needs the same
 * metrics: putting METRICS in primitives.ts would close an import cycle
 * between the two. This module imports nothing but the JSON itself, so no
 * cycle is possible through it.
 *
 * What this replaces: the identical FontMetrics interface and METRICS cast
 * that used to be redeclared in all five modes and in glyph-bounds.ts. The
 * project rule that modes must not converge still stands - it is about
 * composition policy (margins, type size, line breaking, any layout
 * constant), which stays private to each mode. Font data is not policy.
 */
import onestGlyphs from './onest-glyphs.json';

export interface FontMetrics {
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
export const METRICS = onestGlyphs as unknown as Record<'500' | '800', FontMetrics>;
