import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { render } from '@/lib/poster/render';
import { getPosterByCode, posterSpecFromRow } from '@/lib/db/queries';
import { PosterDisplay } from '@/components/poster/PosterDisplay';

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

  return <PosterDisplay svg={svg} code={code} phrase={row.phrase} />;
}
