import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { render } from '@/lib/poster/render';
import { getPosterByCode, posterSpecFromRow } from '@/lib/db/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const row = await getPosterByCode(code);
  if (!row) return {};
  return {
    title: row.phrase,
    description: `A typographic poster: "${row.phrase}"`,
    robots: { index: false, follow: false },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const row = await getPosterByCode(code);
  if (!row) notFound();

  const svg = render(posterSpecFromRow(row));

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-[640px]" dangerouslySetInnerHTML={{ __html: svg }} />
      {/* Temporary: replaced by the real download UI in stage 6 */}
      <div>
        <a href={`/p/${code}/download/svg`} download>
          SVG
        </a>
        <a href={`/p/${code}/download/png`} download>
          PNG
        </a>
      </div>
    </div>
  );
}
