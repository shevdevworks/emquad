'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { SITE_ACCENT, TEXT_MUTED, TEXT_PRIMARY } from '@/lib/theme';

export interface ErrorScreenProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}

const buttonStyle = {
  borderRadius: '8px',
  fontFamily: 'Onest',
  fontWeight: 500,
  fontSize: '13px',
  letterSpacing: '0.08em',
} as const;

/**
 * Body of the error.tsx boundaries. Mirrors the 404 page's composition so a
 * failure still looks like the site, and lives inside the route groups for
 * the same reason not-found.tsx does: a root-level boundary would render
 * without GlobalChrome.
 */
export function ErrorScreen({ error, retry }: ErrorScreenProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div
        style={{
          color: TEXT_MUTED,
          fontFamily: 'Onest',
          fontWeight: 500,
          letterSpacing: '0.18em',
          fontSize: '11px',
          textAlign: 'center',
        }}
      >
        ERROR
      </div>
      <h1
        style={{
          color: TEXT_PRIMARY,
          fontFamily: 'Onest',
          fontWeight: 500,
          fontSize: '44px',
          lineHeight: 1.05,
          textAlign: 'center',
        }}
      >
        Something broke on our side.
      </h1>
      <p
        style={{
          color: TEXT_MUTED,
          fontFamily: 'Onest',
          fontWeight: 500,
          fontSize: '15px',
          lineHeight: 1.5,
          maxWidth: '460px',
          textAlign: 'center',
        }}
      >
        The page failed to load. Try again, or start a new manifest.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="emq-glass inline-flex items-center justify-center px-6 py-3 transition-opacity hover:opacity-90"
          style={{ ...buttonStyle, color: TEXT_PRIMARY }}
        >
          TRY AGAIN
        </button>
        <Link
          href="/create"
          className="inline-flex items-center justify-center px-6 py-3 transition-opacity hover:opacity-90"
          style={{ ...buttonStyle, backgroundColor: SITE_ACCENT, color: '#101214' }}
        >
          CREATE YOUR OWN
        </Link>
      </div>
    </div>
  );
}
