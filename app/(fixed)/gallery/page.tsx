import type { Metadata } from 'next';
import { tryRender } from '@/lib/poster/render';
import { listGalleryPosters, posterSpecFromRow } from '@/lib/db/queries';
import { orderGalleryRows } from '@/lib/gallery/order';
import { GalleryWall } from '@/components/gallery/GalleryWall';
import { GALLERY_URLS } from '@/seed/gallery';
import { checkGalleryUrls } from '@/lib/gallery/specs';
import { galleryJsonLd } from '@/lib/seo/gallery-seo';
import { serializeJsonLd } from '@/lib/seo/poster-seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gallery — Emquad',
  description: 'Sixteen posters built from short phrases.',
  alternates: { canonical: '/gallery' },
};

export default async function Page() {
  const rows = await listGalleryPosters();
  const { specs: fileSpecsInOrder } = checkGalleryUrls(GALLERY_URLS);

  const orderedRows = orderGalleryRows(
    rows.map((row) => ({ spec: posterSpecFromRow(row), createdAt: row.createdAt, source: row })),
    fileSpecsInOrder,
  );

  // tryRender, the way every other consumer of the renderer does it: a row
  // with no layout drops out of the wall instead of taking the whole page -
  // and the other fifteen posters - down with a 500. The curated set is
  // verified by npm run gallery:check, so this is a floor under the page, not
  // a case that is expected to happen.
  const posters = orderedRows.flatMap((row) => {
    const svg = tryRender(posterSpecFromRow(row));
    return svg === null ? [] : [{ code: row.code, phrase: row.phrase, svg }];
  });

  const jsonLd = galleryJsonLd(posters);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <GalleryWall posters={posters} />
    </>
  );
}
