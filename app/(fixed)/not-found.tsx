'use client';

import Link from 'next/link';
import { SITE_ACCENT, TEXT_MUTED, TEXT_PRIMARY } from '@/lib/theme';

export default function NotFound() {
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
        ERROR 404
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
        This address doesn&apos;t exist.
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
        No page lives here — the link is broken, or was never right to begin with. Build a manifest of your own
        instead.
      </p>
      <Link
        href="/create"
        className="inline-flex items-center justify-center px-6 py-3 transition-opacity hover:opacity-90"
        style={{
          backgroundColor: SITE_ACCENT,
          color: '#101214',
          borderRadius: '8px',
          fontFamily: 'Onest',
          fontWeight: 500,
          fontSize: '13px',
          letterSpacing: '0.08em',
        }}
      >
        CREATE YOUR OWN
      </Link>
    </div>
  );
}
