import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { listGalleryPosters } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

// Poster URLs are sourced from listGalleryPosters(), which returns only
// rows flagged inGallery; non-gallery posters stay out of the sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const galleryPosters = await listGalleryPosters();

  return [
    {
      url: SITE_URL,
      // Static on purpose, not new Date() - bump by hand when the page changes visibly.
      lastModified: '2026-09-04',
      changeFrequency: 'monthly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/create`,
      // Static on purpose, not new Date() - bump by hand when the page changes visibly.
      lastModified: '2026-09-04',
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/gallery`,
      lastModified: '2026-09-11',
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    ...galleryPosters.map((row) => ({
      url: `${SITE_URL}/p/${row.code}`,
      lastModified: row.createdAt,
      // widen-prevention: MetadataRoute entries require a literal union, not string
      changeFrequency: 'yearly' as const,
      priority: 0.6,
    })),
  ];
}
