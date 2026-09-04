import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// The gallery page will add up to 16 manifest URLs here once it exists.
// No code for that yet — see debt 39 in docs/handoff.md.
export default function sitemap(): MetadataRoute.Sitemap {
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
  ];
}
