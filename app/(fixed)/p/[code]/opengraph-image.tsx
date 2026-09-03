import { ImageResponse } from 'next/og';
import { render, paperColorFor } from '@/lib/poster/render';
import { getPosterByCode, posterSpecFromRow } from '@/lib/db/queries';

export const alt = 'Emquad poster';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const row = await getPosterByCode(code);
  if (!row) {
    return new Response('Not Found', { status: 404 });
  }

  const spec = posterSpecFromRow(row);
  const svg = render(spec);
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: paperColorFor(spec),
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgDataUrl} width={504} height={630} alt="" />
      </div>
    ),
    size,
  );
}
