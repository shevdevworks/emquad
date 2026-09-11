import { SITE_URL } from '@/lib/site';

export interface GalleryJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'CollectionPage';
  readonly name: string;
  readonly url: string;
  readonly mainEntity: {
    readonly '@type': 'ItemList';
    readonly itemListElement: ReadonlyArray<{
      readonly '@type': 'ListItem';
      readonly position: number;
      readonly url: string;
      readonly name: string;
    }>;
  };
}

export function galleryJsonLd(
  posters: readonly { readonly code: string; readonly phrase: string }[],
): GalleryJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Gallery — Emquad',
    url: `${SITE_URL}/gallery`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posters.map((poster, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/p/${poster.code}`,
        name: poster.phrase,
      })),
    },
  };
}
