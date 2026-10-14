'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="emq-enter flex flex-1 flex-col items-center justify-center gap-5 py-12 text-center">
      <p className="emq-kicker">Error 404</p>
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
        This address doesn&apos;t exist.
      </h1>
      <p className="emq-body" style={{ maxWidth: '460px' }}>
        No page lives here — the link is broken, or was never right to begin with. Build a poster of your own
        instead.
      </p>
      <Link href="/create" className="emq-btn emq-btn--primary">
        Create a poster
      </Link>
    </div>
  );
}
