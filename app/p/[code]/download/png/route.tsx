import { ImageResponse } from 'next/og';
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
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
  const name = posterFileName(row.phrase, code, 'png');
  const fallback = asciiFileName(code, 'png');

  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={svgDataUrl} width={2160} height={2700} alt="" />
    ),
    {
      width: 2160,
      height: 2700,
      headers: {
        'Content-Disposition': contentDisposition(name, fallback),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  );
}
