import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tryRender } from '@/lib/poster/render';
import { getPosterByCode, posterSpecFromRow } from '@/lib/db/queries';
import { PosterDisplay } from '@/components/poster/PosterDisplay';
import { posterRobots, posterJsonLd, serializeJsonLd } from '@/lib/seo/poster-seo';

const getPoster = cache(getPosterByCode);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const row = await getPoster(code);
  if (!row) return {};
  return {
    title: row.phrase,
    description: 'Built from letters, not templates.',
    alternates: { canonical: `/p/${code}` },
    robots: posterRobots(row.inGallery),
    openGraph: {
      url: `/p/${code}`,
      type: 'website',
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const row = await getPoster(code);
  if (!row) notFound();

  // Save refuses specs with no layout, so a row that cannot render predates
  // that check or was written by hand. A 404 is the honest answer: there is
  // no poster to show, and a 500 would read as the site being down.
  const svg = tryRender(posterSpecFromRow(row));
  if (svg === null) notFound();
  const jsonLd = posterJsonLd({ code, phrase: row.phrase, inGallery: row.inGallery });

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <PosterDisplay svg={svg} code={code} phrase={row.phrase} />
    </>
  );
}
