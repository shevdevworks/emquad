'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PosterSpec } from '@/lib/poster/types';
import { ACCENT_COLOR } from '@/lib/poster/render';
import { SHOWCASE_COMPOSITIONS } from './showcase-phrases';
import { ShowcasePanel } from './ShowcasePanel';

export interface HeroProps {
  readonly initialSpec: PosterSpec;
  readonly initialSvg: string;
}

type RenderFn = (spec: PosterSpec) => string;
type MotionSpeed = 'slow' | 'medium' | 'off';
type TransitionStyle = 'hard' | 'soft';
type ThreeStep = 0 | 1 | 2;

const CYCLE_MS = 6000;

// Single source for the site's own text colors - referenced everywhere text
// color is set, never re-declared.
const TEXT_PRIMARY = '#F2F5F7';
const TEXT_MUTED = '#8A9299';

function motionDurationFor(speed: MotionSpeed): string {
  return speed === 'slow' ? '65s' : '50s';
}

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
    light: false,
    motion: false,
    grain: true,
  });
  const [motionSpeed, setMotionSpeed] = useState<MotionSpeed>('off');
  const [grainStep, setGrainStep] = useState<ThreeStep>(1);
  const [photoOpacity, setPhotoOpacity] = useState(60);
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>('hard');
  const [accentColor, setAccentColor] = useState<string>(ACCENT_COLOR);
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

  function toggleLayer(key: 'photo' | 'vignette' | 'light' | 'motion' | 'grain') {
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
    <div className="relative isolate h-full w-full overflow-hidden bg-black">
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
        .home-motion-layer {
          background:
            radial-gradient(ellipse 70% 60% at 18% 78%, rgba(255,255,255,0.30), transparent 60%),
            radial-gradient(circle at 18% 78%, ${accentColor}14, transparent 45%);
          animation: home-drift var(--drift-duration, 50s) ease-in-out infinite alternate;
        }
        @keyframes home-drift {
          0%   { background-position: 0% 100%, 0% 100%; }
          100% { background-position: 100% 0%, 100% 0%; }
        }
        .home-poster-soft {
          animation: home-poster-fade-in 350ms ease-out;
        }
        @keyframes home-poster-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
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
              `radial-gradient(ellipse 70% 60% at 18% 78%, rgba(255,255,255,0.34), transparent 60%),` +
              `radial-gradient(circle at 18% 78%, ${accentColor}1A, transparent 45%)`,
          }}
        />
      )}

      {layers.motion && (
        <div
          aria-hidden
          className="home-motion-layer fixed inset-0 -z-20"
          style={{
            ['--drift-duration' as string]: motionDurationFor(motionSpeed),
            animationPlayState: motionSpeed === 'off' ? 'paused' : 'running',
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

      <div className="fixed inset-x-8 top-8 z-20 flex items-center justify-between">
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

      {panelVisible && (
        <>
          <div
            data-composition-counter
            className="fixed bottom-8 right-8 z-20"
            style={{ color: TEXT_MUTED, fontFamily: 'Onest', fontWeight: 500, letterSpacing: '0.08em', fontSize: '12px' }}
          >
            {String(index + 1).padStart(2, '0')} / {String(SHOWCASE_COMPOSITIONS.length).padStart(2, '0')}
          </div>

          <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6">
            <div
              key={index}
              data-poster-wrapper
              className={
                'aspect-[4/5] [&_svg]:block [&_svg]:h-full [&_svg]:w-full' +
                (transitionStyle === 'soft' ? ' home-poster-soft' : '')
              }
              style={{ width: 'min(min(70vh, calc(100vh - 250px)) * 0.8, 100%)' }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />

            <div
              className="mt-[40px] text-center text-[12px] uppercase"
              style={{ color: TEXT_MUTED, fontFamily: 'Onest', fontWeight: 500, letterSpacing: '0.32em' }}
            >
              TYPOGRAPHIC MANIFESTOS
            </div>

            <a
              href="/create"
              className="mt-[18px] text-center text-[14px] uppercase transition-opacity hover:opacity-70"
              style={{ color: TEXT_PRIMARY, fontFamily: 'Onest', fontWeight: 800, letterSpacing: '0.14em' }}
            >
              START
            </a>
          </div>

          <ShowcasePanel
            layers={layers}
            onToggleLayer={toggleLayer}
            motionSpeed={motionSpeed}
            onMotionSpeedChange={setMotionSpeed}
            grainStep={grainStep}
            onGrainStepChange={setGrainStep}
            photoOpacity={photoOpacity}
            onPhotoOpacityChange={setPhotoOpacity}
            transitionStyle={transitionStyle}
            onTransitionStyleChange={setTransitionStyle}
            accentColor={accentColor}
            onAccentColorChange={setAccentColor}
            onAdvance={handleManualAdvance}
            currentMode={currentSpec.params.mode}
            currentSeed={currentSpec.params.seed}
          />
        </>
      )}
    </div>
  );
}
