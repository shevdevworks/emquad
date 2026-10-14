'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export interface ErrorScreenProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}

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
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-12 text-center">
      <p className="emq-kicker">Error</p>
      <h1
        style={{
          color: 'var(--emq-text)',
          fontWeight: 500,
          fontSize: 'clamp(32px, 6vw, 44px)',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          textWrap: 'balance',
        }}
      >
        Something broke on our side.
      </h1>
      <p className="emq-body" style={{ maxWidth: '460px' }}>
        The page failed to load. Try again, or start a new poster.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className="emq-btn emq-btn--secondary">
          Try again
        </button>
        <Link href="/create" className="emq-btn emq-btn--primary">
          Create a poster
        </Link>
      </div>
    </div>
  );
}
