export function posterSlug(phrase: string): string {
  let slug = phrase
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  // Slug length can't exceed the source phrase length (each separator run
  // collapses to one hyphen), and normalizePhrase caps phrases at 40 chars
  // (MAX_CHARS in lib/poster/types.ts). So this branch is unreachable today —
  // it's a safety net against a future relaxation of that limit, not a path
  // that runs in practice. Don't report it as an exercised branch.
  if (slug.length > 60) {
    slug = slug.slice(0, 60);
    const lastHyphen = slug.lastIndexOf('-');
    if (lastHyphen !== -1) {
      slug = slug.slice(0, lastHyphen);
    }
    slug = slug.replace(/^-+|-+$/g, '');
  }

  return slug;
}

export function posterFileName(phrase: string, code: string, ext: 'png' | 'svg'): string {
  const slug = posterSlug(phrase);
  return slug ? `emquad-${slug}-${code}.${ext}` : `emquad-${code}.${ext}`;
}

export function asciiFileName(code: string, ext: 'png' | 'svg'): string {
  return `emquad-${code}.${ext}`;
}

export function contentDisposition(name: string, fallback: string): string {
  // encodeURIComponent leaves ! ' ( ) * unescaped, which aren't attr-char
  // under RFC 5987 — but posterSlug's output is limited to letters, digits,
  // and hyphens, and posterFileName/asciiFileName only add '-', '.', and the
  // code, so none of those characters ever reach `name`.
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
