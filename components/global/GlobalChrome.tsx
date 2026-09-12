'use client';

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE_ACCENT, TEXT_PRIMARY } from '@/lib/theme';
import { BackLink } from './BackLink';

const PHOTO_OPACITY = 0.6;
const GRAIN_OPACITY = 0.07;

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

// Below 1024px the content shell scrolls while the background layers stay
// fixed, so the header is sticky there. Its backdrop is tied to this flag
// rather than being always on: at rest there is nothing under the header to
// cover, and a permanent dark strip would sit over the bare smoke.
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

export type ChromeMode = 'fixed' | 'flow';

export interface GlobalChromeProps {
  readonly mode: ChromeMode;
  readonly children: ReactNode;
}

export function GlobalChrome({ mode, children }: GlobalChromeProps) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const scrolled = useSyncExternalStore(subscribeScroll, getScrolledSnapshot, getScrolledServerSnapshot);

  // fixed: one non-scrolling viewport-height screen (home, poster page).
  // flow: normal document flow that grows and scrolls (the editor, which is
  // taller than the viewport and would otherwise clip its own controls).
  // The mobile (<1024px) override below already puts fixed pages into this
  // same state - flow just applies those same values unconditionally.
  const pageShellClass = mode === 'fixed' ? 'h-dvh overflow-hidden emq-page-shell' : 'min-h-dvh emq-page-shell';
  const heroRootClass =
    mode === 'fixed'
      ? 'relative isolate h-full w-full overflow-hidden bg-black emq-hero-root'
      : 'relative isolate w-full bg-black emq-hero-root';
  const contentShellClass =
    mode === 'fixed'
      ? 'absolute inset-8 z-20 flex flex-col emq-content-shell'
      : 'static z-20 flex flex-col box-border p-8 min-h-dvh emq-content-shell';

  return (
    <div className={pageShellClass}>
      <div className={heroRootClass}>
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

          @media (max-width: 1023px) {
            .emq-page-shell {
              height: auto;
              min-height: 100dvh;
              overflow: visible;
            }
            .emq-hero-root {
              height: auto;
              overflow: visible;
            }
            .emq-content-shell {
              position: static;
              padding: 32px;
              box-sizing: border-box;
              min-height: 100dvh;
            }
            .emq-site-header {
              position: sticky;
              top: 0;
              z-index: 30;
              /* Bleed over the shell's 32px side padding so the backdrop reaches
                 the viewport edges; the matching padding puts the labels back
                 exactly where they were. Vertical geometry is untouched. */
              margin-inline: -32px;
              padding-inline: 32px;
            }
            /* Backdrop as a pseudo-element, so the header keeps its own box and
               the scrolling content below it is not pushed by a taller bar.
               The top bleed covers the shell's 32px top padding while the header
               is still travelling up to top: 0. */
            .emq-site-header--scrolled::before {
              content: '';
              position: absolute;
              inset: -32px 0 auto 0;
              height: calc(100% + 56px);
              background: linear-gradient(
                to bottom,
                #000 0%,
                rgba(0, 0, 0, 0.92) 62%,
                rgba(0, 0, 0, 0) 100%
              );
              z-index: -1;
              pointer-events: none;
            }
          }
        `}</style>

        {reducedMotion ? (
          // next/image's `fill` mode hardcodes position:absolute inline, which can't be
          // overridden to position:fixed (required to match the other background layers) -
          // plain <img> is the only way to get a fixed, full-viewport decorative layer here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            aria-hidden
            src="/smoke-poster.jpg"
            alt=""
            className="fixed inset-0 h-full w-full object-cover object-center -z-40"
            style={{ opacity: PHOTO_OPACITY }}
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
            style={{ opacity: PHOTO_OPACITY }}
          >
            <source src="/smoke-loop.webm" type="video/webm" />
            <source src="/smoke-loop.mp4" type="video/mp4" />
          </video>
        )}

        <div
          aria-hidden
          className="fixed inset-0 -z-30"
          style={{
            background:
              `radial-gradient(ellipse 70% 60% at 79% 49%, rgba(255,255,255,0.34), transparent 60%),` +
              `radial-gradient(circle at 79% 49%, ${SITE_ACCENT}1A, transparent 45%)`,
          }}
        />

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

        <div className={contentShellClass}>
          <SiteHeader scrolled={scrolled} />
          {children}
        </div>
      </div>
    </div>
  );
}

interface SiteHeaderProps {
  readonly scrolled: boolean;
}

// One style for every item in the header, wordmark included, so the back
// button (a <button>, which carries its own UA font and color) is
// indistinguishable from the links next to it.
const HEADER_ITEM_STYLE = {
  color: TEXT_PRIMARY,
  fontFamily: 'Onest',
  fontWeight: 800,
  letterSpacing: '0.08em',
  fontSize: '13px',
} as const;

const HEADER_ITEM_CLASS = 'transition-opacity hover:opacity-70';

function SiteHeader({ scrolled }: SiteHeaderProps) {
  const pathname = usePathname();

  const isHome = pathname === '/';
  // The poster page carries a CREATE YOUR OWN button in its own action row,
  // so a header CREATE there would be a second copy of the same offer.
  const showCreate = pathname !== '/create' && !pathname.startsWith('/p/');
  const showGallery = pathname !== '/gallery';

  return (
    <div
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
          className={HEADER_ITEM_CLASS}
          style={HEADER_ITEM_STYLE}
          onClick={() => window.location.reload()}
        >
          EMQUAD
        </button>
      ) : (
        <Link href="/" className={HEADER_ITEM_CLASS} style={HEADER_ITEM_STYLE}>
          EMQUAD
        </Link>
      )}
      <div className="flex items-center gap-6">
        {!isHome && <BackLink className={HEADER_ITEM_CLASS} style={HEADER_ITEM_STYLE} />}
        {showGallery && (
          <Link href="/gallery" className={HEADER_ITEM_CLASS} style={HEADER_ITEM_STYLE}>
            GALLERY
          </Link>
        )}
        {showCreate && (
          <Link href="/create" className={HEADER_ITEM_CLASS} style={HEADER_ITEM_STYLE}>
            CREATE
          </Link>
        )}
      </div>
    </div>
  );
}
