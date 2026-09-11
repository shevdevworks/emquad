import type { Metadata } from 'next';
import { render } from '@/lib/poster/render';
import { listGalleryPosters, posterSpecFromRow } from '@/lib/db/queries';
import { orderGalleryRows } from '@/lib/gallery/order';
import { GalleryWall } from '@/components/gallery/GalleryWall';
import { GALLERY_URLS } from '@/seed/gallery';
import { checkGalleryUrls } from '@/seed/gallery-checks';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gallery — Emquad',
  description: 'Sixteen posters built from short phrases.',
};

export default async function Page() {
  const rows = await listGalleryPosters();
  const { specs: fileSpecsInOrder } = checkGalleryUrls(GALLERY_URLS);

  const orderedRows = orderGalleryRows(
    rows.map((row) => ({ spec: posterSpecFromRow(row), createdAt: row.createdAt, source: row })),
    fileSpecsInOrder,
  );

  const posters = orderedRows.map((row) => ({
    code: row.code,
    phrase: row.phrase,
    svg: render(posterSpecFromRow(row)),
  }));

  return <GalleryWall posters={posters} />;
}
