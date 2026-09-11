/**
 * Loads the GALLERY_URLS array from seed/gallery.ts (or, for testing only,
 * a file given as an explicit path) by importing it as a module. Node-only
 * on purpose: process.cwd(), node:path and node:url are not safe to import
 * from app/(fixed)/gallery/page.tsx - a dynamic filesystem access anywhere
 * in that chain makes Turbopack trace the whole project into the server
 * build. The pure validation logic that used to share this file lives in
 * lib/gallery/specs.ts instead, which the page imports directly.
 */
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadGalleryUrls(argPath?: string): Promise<readonly string[]> {
  const filePath = argPath
    ? path.resolve(process.cwd(), argPath)
    : path.resolve(process.cwd(), 'seed', 'gallery.ts');
  const mod = (await import(pathToFileURL(filePath).href)) as { GALLERY_URLS: readonly string[] };
  return mod.GALLERY_URLS;
}
