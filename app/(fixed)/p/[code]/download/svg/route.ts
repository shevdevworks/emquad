import { render } from '@/lib/poster/render';
import { getPosterByCode, posterSpecFromRow } from '@/lib/db/queries';
import { posterFileName, asciiFileName, contentDisposition } from '@/lib/poster/filename';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const row = await getPosterByCode(code);
  if (!row) {
    return new Response('Not Found', { status: 404 });
  }

  const svg = render(posterSpecFromRow(row));
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
