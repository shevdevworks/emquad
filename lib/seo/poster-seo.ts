import { SITE_URL } from '@/lib/site';

export function posterRobots(inGallery: boolean): { index: boolean; follow: boolean } {
  return inGallery ? { index: true, follow: true } : { index: false, follow: true };
}

export interface PosterJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'VisualArtwork';
  readonly name: string;
  readonly url: string;
  readonly artform: 'Poster';
  readonly isPartOf: {
    readonly '@type': 'CollectionPage';
    readonly url: string;
  };
}

export function posterJsonLd(input: {
  readonly code: string;
  readonly phrase: string;
  readonly inGallery: boolean;
}): PosterJsonLd | null {
  if (!input.inGallery) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    name: input.phrase,
    url: `${SITE_URL}/p/${input.code}`,
    artform: 'Poster',
    isPartOf: { '@type': 'CollectionPage', url: `${SITE_URL}/gallery` },
  };
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
