'use client';

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BackLink, useSiteHistory } from './BackLink';

// The smoke used to sit at 0.6 with a white light spot behind the hero card,
// and on its brightest frames it fought the headline for attention. It now
// stays in the background: a lower opacity, plus a scrim (below) that keeps
// the text side of every frame dark.
const SMOKE_OPACITY = 0.34;
const GRAIN_OPACITY = 0.06;

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

// The content shell scrolls while the background layers stay fixed, so the
// header is sticky. Its backdrop is tied to this flag rather than being always
// on: at rest there is nothing under the header to cover, and a permanent dark
// strip would sit over the bare background.
const HEADER_BACKDROP_AT_SCROLL_PX = 8;

function subscribeScroll(callback: () => void) {
  window.addEventListener('scroll', callback, { passive: true });
  return () => window.removeEventListener('scroll', callback);
}

function getScrolledSnapshot(): boolean {
  return window.scrollY > HEADER_BACKDROP_AT_SCROLL_PX;
}

function getScrolledServerSnapshot(): boolean {
  return false;
}

/**
 * smoke: the looping smoke video, kept low and behind a scrim - home, gallery
 * and poster pages. calm: a still, near-flat background for the editor, where
 * the poster being built is the only thing that should move.
 */
export type ChromeBackdrop = 'smoke' | 'calm';

export interface GlobalChromeProps {
  readonly backdrop: ChromeBackdrop;
  readonly children: ReactNode;
}

export function GlobalChrome({ backdrop, children }: GlobalChromeProps) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const scrolled = useSyncExternalStore(subscribeScroll, getScrolledSnapshot, getScrolledServerSnapshot);

  return (
    <div className="emq-page relative isolate min-h-dvh w-full">
      <style>{`
        @font-face {
          font-family: 'Onest';
          src: url('/fonts/Onest-500.ttf') format('truetype');
          font-weight: 500;
          font-display: swap;
        }
        @font-face {
          font-family: 'Onest';
          src: url('/fonts/Onest-800.ttf') format('truetype');
          font-weight: 800;
          font-display: swap;
        }

        .emq-page {
          background: var(--emq-bg);
        }

        /* One shell for every page: at least a viewport tall, growing and
           scrolling when the content needs it. A page that wants to fill the
           screen (home) does it with flex: 1 inside <main>. */
        .emq-shell {
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          min-height: 100dvh;
          padding: var(--emq-gutter);
          padding-top: max(16px, calc(var(--emq-gutter) - 8px));
        }

        .emq-site-header {
          position: sticky;
          top: 0;
          z-index: 30;
          /* Bleed over the shell's side padding so the backdrop reaches the
             viewport edges; the matching padding puts the labels back exactly
             where they were. */
          margin-inline: calc(var(--emq-gutter) * -1);
          padding-inline: var(--emq-gutter);
        }
        /* Backdrop as a pseudo-element, so the header keeps its own box and
           the scrolling content below it is not pushed by a taller bar. */
        .emq-site-header--scrolled::before {
          content: '';
          position: absolute;
          inset: -32px 0 auto 0;
          height: calc(100% + 56px);
          background: linear-gradient(
            to bottom,
            var(--emq-bg) 0%,
            color-mix(in srgb, var(--emq-bg) 92%, transparent) 62%,
            transparent 100%
          );
          z-index: -1;
          pointer-events: none;
        }

        .emq-nav-item {
          color: var(--emq-text);
          font-weight: 800;
          letter-spacing: 0.08em;
          font-size: 13px;
          /* The visible label is small; the hit area is not. */
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          padding-inline: 2px;
          transition: opacity var(--emq-fast) var(--emq-ease);
        }
        .emq-nav-item:hover {
          opacity: 0.7;
        }

        /* Keeps the darkest part of every smoke frame under the text column:
           strongest at the left, where the hero copy sits, and along the top
           and bottom edges. */
        .emq-scrim {
          background:
            linear-gradient(
              90deg,
              color-mix(in srgb, var(--emq-bg) 82%, transparent) 0%,
              color-mix(in srgb, var(--emq-bg) 55%, transparent) 45%,
              color-mix(in srgb, var(--emq-bg) 30%, transparent) 100%
            ),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--emq-bg) 40%, transparent) 0%,
              transparent 30%,
              transparent 70%,
              color-mix(in srgb, var(--emq-bg) 70%, transparent) 100%
            );
        }
        @media (max-width: 1023px) {
          .emq-scrim {
            background: color-mix(in srgb, var(--emq-bg) 58%, transparent);
          }
        }
      `}</style>

      <a href="#main" className="emq-skip-link">
        Skip to content
      </a>

      {backdrop === 'smoke' &&
        (reducedMotion ? (
          // next/image's `fill` mode hardcodes position:absolute inline, which can't be
          // overridden to position:fixed (required to match the other background layers) -
          // plain <img> is the only way to get a fixed, full-viewport decorative layer here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            aria-hidden
            src="/smoke-poster.jpg"
            alt=""
            className="fixed inset-0 h-full w-full object-cover object-center -z-40"
            style={{ opacity: SMOKE_OPACITY }}
          />
        ) : (
          <video
            aria-hidden
            autoPlay
            muted
            loop
            playsInline
            poster="/smoke-poster.jpg"
            preload="metadata"
            className="fixed inset-0 h-full w-full object-cover object-center -z-40"
            style={{ opacity: SMOKE_OPACITY }}
          >
            <source src="/smoke-loop.webm" type="video/webm" />
            <source src="/smoke-loop.mp4" type="video/mp4" />
          </video>
        ))}

      {backdrop === 'smoke' ? (
        <div aria-hidden className="emq-scrim fixed inset-0 -z-30" />
      ) : (
        // The editor's backdrop: one faint, static pool of light in the corner
        // the preview sits in, so the page is not a flat void, and nothing
        // that moves.
        <div
          aria-hidden
          className="fixed inset-0 -z-30"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 80% 30%, rgba(255,255,255,0.035), transparent 70%)',
          }}
        />
      )}

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 mix-blend-overlay"
        style={{ opacity: GRAIN_OPACITY }}
      >
        <svg width="0" height="0">
          <filter id="home-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
          </filter>
        </svg>
        <div className="h-full w-full" style={{ filter: 'url(#home-grain)', background: '#fff' }} />
      </div>

      <div className="emq-shell">
        <SiteHeader scrolled={scrolled} />
        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

interface SiteHeaderProps {
  readonly scrolled: boolean;
}

function SiteHeader({ scrolled }: SiteHeaderProps) {
  const pathname = usePathname();
  useSiteHistory();

  const isHome = pathname === '/';
  const showCreate = pathname !== '/create';
  const showGallery = pathname !== '/gallery';

  return (
    <header
      className={`emq-site-header flex h-12 shrink-0 items-center justify-between${
        scrolled ? ' emq-site-header--scrolled' : ''
      }`}
    >
      {isHome ? (
        // Already here, so there is nowhere to link: the wordmark reloads the
        // page instead. router.refresh() would not do it - it re-fetches the
        // server payload and leaves client state in place.
        <button
          type="button"
          className="emq-nav-item"
          aria-label="Emquad, reload home page"
          onClick={() => window.location.reload()}
        >
          EMQUAD
        </button>
      ) : (
        <Link href="/" className="emq-nav-item" aria-label="Emquad, home">
          EMQUAD
        </Link>
      )}
      <nav aria-label="Main" className="flex items-center gap-5 sm:gap-6">
        {!isHome && <BackLink className="emq-nav-item" />}
        {showGallery && (
          <Link href="/gallery" className="emq-nav-item">
            GALLERY
          </Link>
        )}
        {showCreate && (
          <Link href="/create" className="emq-nav-item">
            CREATE
          </Link>
        )}
      </nav>
    </header>
  );
}
