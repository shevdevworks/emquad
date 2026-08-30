'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PosterSpec } from '@/lib/poster/types';
import { ACCENT_COLOR } from '@/lib/poster/render';
import { SHOWCASE_COMPOSITIONS } from './showcase-phrases';
import { ACCENT_CANDIDATES, ShowcasePanel } from './ShowcasePanel';

export interface HeroProps {
  readonly initialSpec: PosterSpec;
  readonly initialSvg: string;
}

type RenderFn = (spec: PosterSpec) => string;
type TransitionStyle = 'hard' | 'soft';
type ThreeStep = 0 | 1 | 2;

const CYCLE_MS = 6000;

// Single source for the site's own text colors - referenced everywhere text
// color is set, never re-declared.
const TEXT_PRIMARY = '#F2F5F7';
const TEXT_MUTED = '#8A9299';

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

export function Hero({ initialSpec, initialSvg }: HeroProps) {
  const [index, setIndex] = useState(0);
  const [renderFn, setRenderFn] = useState<RenderFn | null>(null);

  const [layers, setLayers] = useState({
    photo: true,
    vignette: false,
    light: true,
    grain: true,
  });
  const [grainStep, setGrainStep] = useState<ThreeStep>(1);
  const [photoOpacity, setPhotoOpacity] = useState(60);
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>('hard');
  const [accentColor, setAccentColor] = useState<string>(ACCENT_CANDIDATES[0]);
  const [posterVisible, setPosterVisible] = useState(true);
  const [panelVisible, setPanelVisible] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void import('@/lib/poster/render').then(({ render }) => {
      if (!cancelled) setRenderFn(() => render);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentSpec = SHOWCASE_COMPOSITIONS[index] ?? initialSpec;

  // render() is pure and synchronous, so the current composition's markup is a
  // plain derived value - no effect/setState needed to keep it in sync with
  // `index`/`renderFn`. The accent-color override is a presentation-layer
  // string substitution on render()'s own output, proven complete and
  // precise for every mode (see plan): the literal ACCENT_COLOR hex appears
  // only where accent color is actually drawn, always uppercase, never in
  // any other form.
  const svg = useMemo(() => {
    const base = renderFn === null ? initialSvg : renderFn(currentSpec);
    return accentColor === ACCENT_COLOR ? base : base.replaceAll(ACCENT_COLOR, accentColor);
  }, [renderFn, currentSpec, initialSvg, accentColor]);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % SHOWCASE_COMPOSITIONS.length);
  }, []);

  const startInterval = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(advance, CYCLE_MS);
  }, [advance]);

  useEffect(() => {
    startInterval();
    return () => clearInterval(intervalRef.current);
  }, [startInterval]);

  function handleManualAdvance() {
    advance();
    startInterval();
  }

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

  const railTextStyle = {
    color: TEXT_MUTED,
    fontFamily: 'Onest',
    fontWeight: 500,
    letterSpacing: '0.18em',
    fontSize: '11px',
  } as const;
  const counterText = `${String(index + 1).padStart(2, '0')} / ${String(SHOWCASE_COMPOSITIONS.length).padStart(2, '0')}`;
  const modeText = currentSpec.params.mode.toUpperCase();

  return (
    <div className="relative isolate h-full w-full overflow-hidden bg-black emq-hero-root">
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
        .home-poster-soft {
          animation: home-poster-fade-in 350ms ease-out;
        }
        @keyframes home-poster-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .emq-glass {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.10);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .emq-card-wrap {
          position: relative;
          perspective: 1200px;
          --poster-h: min(74vh, calc(100vh - 200px), calc((100vw - 788px) / 0.8));
        }
        .emq-card-ghost {
          position: absolute;
          inset: 0;
          transform: translate(20px, -20px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          pointer-events: none;
          z-index: 0;
        }
        .emq-card {
          position: relative;
          z-index: 1;
          padding: 28px;
          border-radius: 16px;
          width: calc(var(--poster-h) * 0.8 + 248px);
          height: calc(var(--poster-h) + 56px);
          transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .emq-card-wrap:hover .emq-card {
          transform: rotateY(-10deg);
        }

        @media (max-width: 1023px) {
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
          .emq-card-wrap {
            --poster-h: min(60dvh, calc((100vw - 120px) / 0.8));
          }
          .emq-card {
            width: calc(var(--poster-h) * 0.8 + 56px);
            height: auto;
          }
          .emq-card-ghost {
            display: none;
          }
          .emq-card-wrap:hover .emq-card {
            transform: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .emq-card {
            transition: none;
          }
          .emq-card-wrap:hover .emq-card {
            transform: none;
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

      <div aria-hidden data-frame-border className="pointer-events-none fixed inset-6 z-20 border border-white/12" />

      <div className="absolute inset-8 z-20 flex flex-col emq-content-shell">
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
            <a
              href="/create"
              className="transition-opacity hover:opacity-70"
              style={{ color: TEXT_PRIMARY, fontFamily: 'Onest', fontWeight: 800, letterSpacing: '0.08em', fontSize: '13px' }}
            >
              CREATE
            </a>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-[72px] lg:pr-6">
          <div className="flex w-full min-w-0 max-w-[520px] flex-col gap-5 lg:min-w-[380px] lg:max-w-[520px] lg:flex-1">
            <div
              style={{ color: TEXT_MUTED, fontFamily: 'Onest', fontWeight: 500, letterSpacing: '0.18em', fontSize: '11px' }}
            >
              SIX WORDS, ONE COMPOSITION
            </div>
            <h1
              style={{
                color: TEXT_PRIMARY,
                fontFamily: 'Onest',
                fontWeight: 500,
                fontSize: '44px',
                lineHeight: 1.05,
              }}
            >
              Turn a phrase into a manifesto
            </h1>
            <p
              style={{
                color: TEXT_MUTED,
                fontFamily: 'Onest',
                fontWeight: 500,
                fontSize: '15px',
                lineHeight: 1.5,
                maxWidth: '460px',
              }}
            >
              Type three to seven words and get a poster built from their shape alone - no
              templates, no stock art. Every version gets a permanent link and a file you
              can keep.
            </p>

            <div className="flex gap-3">
              <a
                href="/create"
                className="inline-flex items-center justify-center px-6 py-3 transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: accentColor,
                  color: '#101214',
                  borderRadius: '8px',
                  fontFamily: 'Onest',
                  fontWeight: 500,
                  fontSize: '13px',
                  letterSpacing: '0.08em',
                }}
              >
                START
              </a>
              {/* TODO: link to /gallery once the gallery page exists */}
              <span
                aria-disabled="true"
                className="emq-glass inline-flex cursor-default items-center justify-center px-6 py-3"
                style={{
                  color: TEXT_PRIMARY,
                  borderRadius: '8px',
                  fontFamily: 'Onest',
                  fontWeight: 500,
                  fontSize: '13px',
                  letterSpacing: '0.08em',
                }}
              >
                GALLERY
              </span>
            </div>

            <div className="flex gap-8 pt-2">
              {[
                { label: 'PERMALINK', text: 'Every poster gets its own link.' },
                { label: 'DOWNLOAD', text: 'PNG or SVG, yours to keep.' },
                { label: 'NO ACCOUNT', text: 'Type a phrase, get a poster.' },
              ].map((item) => (
                <div key={item.label} className="flex flex-col gap-1.5">
                  <span
                    style={{
                      color: TEXT_MUTED,
                      fontFamily: 'Onest',
                      fontWeight: 500,
                      letterSpacing: '0.18em',
                      fontSize: '11px',
                    }}
                  >
                    {item.label}
                  </span>
                  <span style={{ color: TEXT_PRIMARY, fontFamily: 'Onest', fontWeight: 500, fontSize: '13px' }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="emq-card-wrap shrink-0">
            <div className="emq-card-ghost" />
            <div className="emq-card emq-glass">
              <div className="flex h-full flex-col lg:flex-row">
                <div
                  key={index}
                  data-poster-wrapper
                  className={
                    '[&_svg]:block [&_svg]:h-full [&_svg]:w-full' +
                    (transitionStyle === 'soft' ? ' home-poster-soft' : '')
                  }
                  style={{ width: 'calc(var(--poster-h) * 0.8)', height: 'var(--poster-h)' }}
                  {...(posterVisible ? { dangerouslySetInnerHTML: { __html: svg } } : {})}
                />

                {/* vertical divider - desktop rail layout only */}
                <div className="hidden w-8 shrink-0 items-center justify-center lg:flex">
                  <div style={{ width: '1px', height: '100%', background: 'rgba(255,255,255,0.10)' }} />
                </div>

                {/* mode + counter row - narrow-screen layout only */}
                <div className="mt-4 lg:hidden">
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.10)' }} />
                  <div className="mt-4 flex items-center justify-between">
                    <span style={railTextStyle}>{modeText}</span>
                    <span data-composition-counter style={railTextStyle}>
                      {counterText}
                    </span>
                  </div>
                </div>

                {/* rail, bottom-aligned - desktop layout only */}
                <div className="hidden w-40 shrink-0 flex-col justify-end lg:flex">
                  <span style={railTextStyle}>{modeText}</span>
                  <span data-composition-counter style={{ ...railTextStyle, marginTop: '8px' }}>
                    {counterText}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {panelVisible && (
        <ShowcasePanel
          layers={layers}
          onToggleLayer={toggleLayer}
          grainStep={grainStep}
          onGrainStepChange={setGrainStep}
          photoOpacity={photoOpacity}
          onPhotoOpacityChange={setPhotoOpacity}
          transitionStyle={transitionStyle}
          onTransitionStyleChange={setTransitionStyle}
          accentColor={accentColor}
          onAccentColorChange={setAccentColor}
          posterVisible={posterVisible}
          onPosterVisibleChange={setPosterVisible}
          onAdvance={handleManualAdvance}
          currentMode={currentSpec.params.mode}
          currentSeed={currentSpec.params.seed}
        />
      )}
    </div>
  );
}
