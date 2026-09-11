/**
 * Validates the /create addresses in seed/gallery.ts (or, for testing only,
 * the file given as the first CLI argument) via checkGalleryUrls, then
 * builds a contact sheet from the result. Writes nothing to the database -
 * lab/gallery/index.html is the only output, for eyeballing the set before
 * it goes anywhere near production.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { MODES, type PosterSpec } from '../lib/poster/types';
import { render } from '../lib/poster/render';
import { checkGalleryUrls, MAX_RECORDS } from '../lib/gallery/specs';
import { loadGalleryUrls } from './gallery-checks';

function buildSheetHtml(specs: readonly PosterSpec[]): string {
  const total = specs.length;
  const invertedCount = specs.filter((spec) => spec.params.invert).length;
  const modeCounts = MODES.map((mode) => `${mode}: ${specs.filter((spec) => spec.params.mode === mode).length}`);
  const summary = `${total} records — ${modeCounts.join(', ')} — inverted: ${invertedCount}`;

  const cardsHtml = specs
    .map((spec, i) => {
      const caption = `#${i + 1} · ${spec.params.mode} · ${spec.params.density} · ${spec.params.invert ? 'invert' : 'normal'}`;
      return `<div class="card"><div class="card-frame">${render(spec)}</div><div class="caption">${escapeHtml(caption)}</div></div>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Gallery contact sheet</title>
<style>
  * { box-sizing: border-box; }
  body { background: #000; color: #8A9299; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; }
  .summary { font-size: 12px; letter-spacing: 0.05em; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .card-frame { background: #111; border: 1px solid #222; aspect-ratio: 1080 / 1350; overflow: hidden; }
  .card-frame svg { width: 100%; height: 100%; display: block; }
  .caption { margin-top: 6px; font-size: 11px; letter-spacing: 0.05em; color: #8A9299; }
</style>
</head>
<body>
  <div class="summary">${escapeHtml(summary)}</div>
  <div class="grid">${cardsHtml}</div>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * At most one argument: a path to a gallery file, for testing only (see
 * module doc comment). An argument that looks like a flag, or more than
 * one argument, is a usage error - not silently treated as a path.
 */
function parseCheckArgs(argv: readonly string[]): { readonly path?: string } | { readonly error: string } {
  if (argv.length > 1) {
    return { error: `expected at most one argument (a path to a gallery file), got ${argv.length}` };
  }
  const [arg] = argv;
  if (arg === undefined) return {};
  if (arg.startsWith('-')) return { error: `unrecognized argument '${arg}'` };
  return { path: arg };
}

async function main(): Promise<void> {
  const parsedArgs = parseCheckArgs(process.argv.slice(2));
  if ('error' in parsedArgs) {
    console.error(parsedArgs.error);
    process.exitCode = 1;
    return;
  }

  const urls = await loadGalleryUrls(parsedArgs.path);
  const outDir = path.resolve(process.cwd(), 'lab', 'gallery');
  const outFile = path.join(outDir, 'index.html');

  const { errors, specs } = checkGalleryUrls(urls);

  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, buildSheetHtml(specs), 'utf8');

  console.log(`${urls.length} of ${MAX_RECORDS}`);
}

void main();
