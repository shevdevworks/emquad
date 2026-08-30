'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { ACCENT_CANDIDATES, ShowcasePanel } from './ShowcasePanel';

type ThreeStep = 0 | 1 | 2;

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

export function Hero() {
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

        .emq-glass {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.10);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .emq-card-wrap {
          position: relative;
          perspective: 1200px;
        }
        .emq-card {
          position: relative;
          z-index: 1;
          padding: 40px;
          border-radius: 16px;
          width: min(clamp(420px, 47.2vw, 680px), calc((100vh - 200px) * 1.35));
          aspect-ratio: 1.35;
          container-type: inline-size;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 500ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 500ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .emq-card-wrap:hover .emq-card {
          transform: rotateY(-10deg);
          border-color: var(--accent);
          box-shadow: 0 0 32px 0 color-mix(in srgb, var(--accent) 28%, transparent);
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
            width: 100%;
          }
          .emq-card {
            width: 100%;
          }
          .emq-card-wrap:hover .emq-card {
            transform: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
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
          <div className="flex w-full min-w-0 max-w-[520px] flex-col gap-5 lg:min-w-[380px] lg:max-w-[600px] lg:flex-1">
            <div
              style={{ color: TEXT_MUTED, fontFamily: 'Onest', fontWeight: 500, letterSpacing: '0.18em', fontSize: '11px' }}
            >
              A TYPOGRAPHIC POSTER GENERATOR
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
              Built from letters, not templates
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
              Every poster is computed, not assembled. Your phrase decides
              where the lines break, how large the letters grow, and how the
              ink fills the canvas.
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
                { label: 'COMPUTED', text: 'The layout comes from the letters, not a template.' },
                { label: 'CONTROLLED', text: 'Every parameter is yours to move.' },
                { label: 'PERMANENT', text: 'A link and a file for each result.' },
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

          {/* '--accent' is a custom property, not a standard CSSProperties key - same
              pattern the removed MOTION layer used for '--drift-duration'. */}
          <div className="emq-card-wrap shrink-0" style={{ ['--accent' as string]: accentColor }}>
            <div className="emq-card emq-glass">
              <div
                style={{
                  fontFamily: 'Onest',
                  fontWeight: 800,
                  fontSize: 'clamp(40px, 15.5cqi, 104px)',
                  lineHeight: 0.95,
                  letterSpacing: '-0.02em',
                  color: phraseAccentOn ? accentColor : TEXT_PRIMARY,
                }}
              >
                <div style={{ whiteSpace: 'nowrap' }}>A PHRASE</div>
                <div style={{ whiteSpace: 'nowrap' }}>HAS A</div>
                <div style={{ whiteSpace: 'nowrap' }}>SHAPE</div>
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
          accentColor={accentColor}
          onAccentColorChange={setAccentColor}
          phraseAccentOn={phraseAccentOn}
          onPhraseAccentChange={setPhraseAccentOn}
        />
      )}
    </div>
  );
}
