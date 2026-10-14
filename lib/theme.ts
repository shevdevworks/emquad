// Interface palette. The same values are declared as CSS custom properties in
// app/globals.css (--emq-*), which is what most components style with; these
// constants are for the few places that need a color in TypeScript. The lab
// fails if the two copies of the accent drift apart, or if the accent stops
// being the poster's own (ACCENT_COLOR in lib/poster/render.ts).
export const SITE_BG = '#090B0A';
export const SITE_SURFACE = '#121613';
export const SITE_BORDER = '#29322D';
export const SITE_ACCENT = '#3DDC97';
/** Text and icons placed on the accent fill. */
export const ON_ACCENT = '#06140D';
export const TEXT_PRIMARY = '#F4F6F5';
export const TEXT_MUTED = '#A3AAA6';
