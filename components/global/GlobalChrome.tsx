'use client';

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { SITE_ACCENT, TEXT_PRIMARY } from '@/lib/theme';

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
          <SiteHeader />
          {children}
        </div>
      </div>
    </div>
  );
}

function SiteHeader() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between">
      <span
        style={{ color: TEXT_PRIMARY, fontFamily: 'Onest', fontWeight: 800, letterSpacing: '0.08em', fontSize: '13px' }}
      >
        EMQUAD
      </span>
      <div className="flex items-center gap-6">
        <Link
          href="/gallery"
          className="transition-opacity hover:opacity-70"
          style={{ color: TEXT_PRIMARY, fontFamily: 'Onest', fontWeight: 800, letterSpacing: '0.08em', fontSize: '13px' }}
        >
          GALLERY
        </Link>
        <Link
          href="/create"
          className="transition-opacity hover:opacity-70"
          style={{ color: TEXT_PRIMARY, fontFamily: 'Onest', fontWeight: 800, letterSpacing: '0.08em', fontSize: '13px' }}
        >
          CREATE
        </Link>
      </div>
    </div>
  );
}
