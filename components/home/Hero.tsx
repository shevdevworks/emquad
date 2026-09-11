'use client';

import Link from 'next/link';
import { SITE_ACCENT, TEXT_MUTED, TEXT_PRIMARY } from '@/lib/theme';

export function Hero() {
  return (
    <div className="flex flex-1 flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-[72px] lg:pr-6">
      <style>{`
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
          justify-content: center;
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
            START
          </Link>
          <Link
            href="/gallery"
            className="emq-glass inline-flex items-center justify-center px-6 py-3 transition-opacity hover:opacity-90"
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
          </Link>
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
      <div className="emq-card-wrap shrink-0" style={{ ['--accent' as string]: SITE_ACCENT }}>
        <div className="emq-card emq-glass">
          <div
            style={{
              fontFamily: 'Onest',
              fontWeight: 800,
              fontSize: 'clamp(40px, 15.5cqi, 104px)',
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
              textAlign: 'left',
              color: TEXT_PRIMARY,
            }}
          >
            <div style={{ whiteSpace: 'nowrap' }}>A PHRASE</div>
            <div style={{ whiteSpace: 'nowrap' }}>HAS A</div>
            <div style={{ whiteSpace: 'nowrap' }}>SHAPE</div>
          </div>
        </div>
      </div>
    </div>
  );
}
