import { tryRender } from '@/lib/poster/render';
import { getPosterByCode, posterSpecFromRow } from '@/lib/db/queries';
import { posterFileName, asciiFileName, contentDisposition } from '@/lib/poster/filename';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const row = await getPosterByCode(code);
  // A row that cannot render is answered like a missing one - see the poster page.
  const svg = row ? tryRender(posterSpecFromRow(row)) : null;
  if (!row || svg === null) {
    return new Response('Not Found', { status: 404 });
  }
  const name = posterFileName(row.phrase, code, 'svg');
  const fallback = asciiFileName(code, 'svg');

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': contentDisposition(name, fallback),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
