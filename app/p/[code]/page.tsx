import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { render } from '@/lib/poster/render';
import { getPosterByCode } from '@/lib/db/queries';

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

  const svg = render({ phrase: row.phrase, params: row.params });

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-[640px]" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
