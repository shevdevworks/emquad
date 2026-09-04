'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ACCENT_CANDIDATES, ShowcasePanel } from '@/components/home/ShowcasePanel';
import type { CardAlign, Frame } from '@/components/home/ShowcasePanel';

type ThreeStep = 0 | 1 | 2;

// Single source for the site's own text colors - referenced everywhere text
// color is set, never re-declared.
export const TEXT_PRIMARY = '#F2F5F7';
export const TEXT_MUTED = '#8A9299';

function grainOpacityFor(step: ThreeStep): number {
  return step === 0 ? 0.035 : step === 1 ? 0.07 : 0.11;
}

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

interface ShowcaseState {
  readonly accentColor: string;
  readonly phraseAccentOn: boolean;
  readonly frame: Frame;
  /** Editor-only glass fill opacity (0-1). Never read by .emq-glass. */
  readonly glassFill: number;
  readonly cardAlign: CardAlign;
}

const ShowcaseContext = createContext<ShowcaseState | null>(null);

export function useShowcase(): ShowcaseState {
  const ctx = useContext(ShowcaseContext);
  if (!ctx) throw new Error('useShowcase must be used within GlobalChrome');
  return ctx;
}

export type ChromeMode = 'fixed' | 'flow';

export interface GlobalChromeProps {
  readonly mode: ChromeMode;
  readonly children: ReactNode;
}

export function GlobalChrome({ mode, children }: GlobalChromeProps) {
  const [layers, setLayers] = useState({
    photo: true,
    vignette: false,
    light: true,
    grain: true,
  });
  const [grainStep, setGrainStep] = useState<ThreeStep>(1);
  const [photoOpacity, setPhotoOpacity] = useState(60);
  const [accentColor, setAccentColor] = useState<string>(ACCENT_CANDIDATES[0]);
  const [phraseAccentOn, setPhraseAccentOn] = useState(false);
  const [frame, setFrame] = useState<Frame>('glass');
  const [glassFillPercent, setGlassFillPercent] = useState(4);
  const [cardAlign, setCardAlign] = useState<CardAlign>('left');
  const [panelVisible, setPanelVisible] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  function toggleLayer(key: 'photo' | 'vignette' | 'light' | 'grain') {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'h') return;
      const active = document.activeElement;
      const tag = active?.tagName;
      const textLikeInput =
        tag === 'INPUT' &&
        ['text', 'search', 'email', 'number', 'password', 'tel', 'url'].includes((active as HTMLInputElement).type);
      const inTextField = tag === 'TEXTAREA' || textLikeInput || (active instanceof HTMLElement && active.isContentEditable);
      if (inTextField) return;
      setPanelVisible((v) => !v);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    <ShowcaseContext.Provider
      value={{ accentColor, phraseAccentOn, frame, glassFill: glassFillPercent / 100, cardAlign }}
    >
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

          {layers.vignette && (
            <div
              aria-hidden
              className="fixed inset-0 -z-50"
              style={{
                background: 'linear-gradient(180deg, rgba(20,20,24,0.35) 0%, rgba(6,6,8,0.5) 55%, rgba(0,0,0,0.62) 100%)',
              }}
            />
          )}

          {layers.photo &&
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
                style={{ opacity: photoOpacity / 100 }}
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
                style={{ opacity: photoOpacity / 100 }}
              >
                <source src="/smoke-loop.webm" type="video/webm" />
                <source src="/smoke-loop.mp4" type="video/mp4" />
              </video>
            ))}

          {layers.light && (
            <div
              aria-hidden
              className="fixed inset-0 -z-30"
              style={{
                background:
                  `radial-gradient(ellipse 70% 60% at 79% 49%, rgba(255,255,255,0.34), transparent 60%),` +
                  `radial-gradient(circle at 79% 49%, ${accentColor}1A, transparent 45%)`,
              }}
            />
          )}

          {layers.grain && (
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 -z-10 mix-blend-overlay"
              style={{ opacity: grainOpacityFor(grainStep) }}
            >
              <svg width="0" height="0">
                <filter id="home-grain">
                  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} stitchTiles="stitch" />
                  <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
                </filter>
              </svg>
              <div className="h-full w-full" style={{ filter: 'url(#home-grain)', background: '#fff' }} />
            </div>
          )}

          <div className={contentShellClass}>
            <SiteHeader />
            {children}
          </div>

          {panelVisible && (
            <ShowcasePanel
              layers={layers}
              onToggleLayer={toggleLayer}
              grainStep={grainStep}
              onGrainStepChange={setGrainStep}
              photoOpacity={photoOpacity}
              onPhotoOpacityChange={setPhotoOpacity}
              accentColor={accentColor}
              onAccentColorChange={setAccentColor}
              phraseAccentOn={phraseAccentOn}
              onPhraseAccentChange={setPhraseAccentOn}
              frame={frame}
              onFrameChange={setFrame}
              glassFillPercent={glassFillPercent}
              onGlassFillPercentChange={setGlassFillPercent}
              cardAlign={cardAlign}
              onCardAlignChange={setCardAlign}
            />
          )}
        </div>
      </div>
    </ShowcaseContext.Provider>
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
        <span
          className="cursor-default"
          style={{ color: TEXT_MUTED, fontFamily: 'Onest', fontWeight: 800, letterSpacing: '0.08em', fontSize: '13px' }}
        >
          GALLERY
        </span>
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
