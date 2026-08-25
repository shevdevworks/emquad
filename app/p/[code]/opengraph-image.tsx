import { ImageResponse } from 'next/og';
import { render } from '@/lib/poster/render';
import { FIXTURES, type FixtureCode } from '@/lib/poster/fixtures';

function isFixtureCode(code: string): code is FixtureCode {
  return code in FIXTURES;
}

export const alt = 'Emquad poster';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams(): { code: FixtureCode }[] {
  return (Object.keys(FIXTURES) as FixtureCode[]).map((code) => ({ code }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isFixtureCode(code)) {
    return new Response('Not Found', { status: 404 });
  }

  const spec = FIXTURES[code];
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
          backgroundColor: '#000000',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgDataUrl} width={504} height={630} alt="" />
      </div>
    ),
    size,
  );
}
