'use client';

import { useEffect, useRef, useState } from 'react';
import { TEXT_MUTED, TEXT_PRIMARY, useShowcase } from '@/components/global/GlobalChrome';

export interface PosterDisplayProps {
  readonly svg: string;
  readonly code: string;
  readonly phrase: string;
}

const actionTextStyle = {
  fontFamily: 'Onest',
  fontWeight: 500,
  fontSize: '13px',
  letterSpacing: '0.08em',
  borderRadius: '8px',
  color: TEXT_PRIMARY,
} as const;

export function PosterDisplay({ svg, code, phrase }: PosterDisplayProps) {
  const { accentColor, frame } = useShowcase();
  const [shareLabel, setShareLabel] = useState<'SHARE' | 'LINK COPIED'>('SHARE');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: phrase, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareLabel('LINK COPIED');
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setShareLabel('SHARE'), 2000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error(err);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-6 emq-poster-column">
      <style>{`
        .emq-poster-column {
          min-height: 0;
        }
        .emq-poster-label {
          flex: 0 0 auto;
          text-transform: uppercase;
        }
        .emq-poster-slot {
          flex: 1 1 0;
          min-height: 0;
          max-width: 100%;
        }
        .emq-poster-slot--none,
        .emq-poster-slot--hairline {
          aspect-ratio: 0.8;
        }
        .emq-poster-slot--hairline {
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.10);
        }
        .emq-poster-slot--glass {
          box-sizing: border-box;
          display: flex;
          width: fit-content;
          align-self: center;
          padding: 24px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.10);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .emq-poster-inner {
          aspect-ratio: 0.8;
          height: 100%;
        }
        .emq-poster-slot > svg,
        .emq-poster-inner > svg {
          display: block;
          width: 100%;
          height: 100%;
        }
        .emq-poster-actions {
          flex: 0 0 auto;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }

        @media (max-width: 1023px) {
          .emq-poster-slot {
            flex: 0 0 auto;
            width: 100%;
          }
          .emq-poster-slot--glass {
            width: 100%;
          }
          .emq-poster-inner {
            width: 100%;
            height: auto;
          }
        }
      `}</style>

      <div
        className="emq-poster-label"
        style={{ color: TEXT_MUTED, fontFamily: 'Onest', fontWeight: 500, letterSpacing: '0.18em', fontSize: '11px' }}
      >
        {phrase}
      </div>

      {frame === 'glass' ? (
        <div className="emq-poster-slot emq-poster-slot--glass">
          <div className="emq-poster-inner" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      ) : (
        <div
          className={`emq-poster-slot ${frame === 'hairline' ? 'emq-poster-slot--hairline' : 'emq-poster-slot--none'}`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}

      <div className="emq-poster-actions">
        <a
          href={`/p/${code}/download/svg`}
          download
          className="emq-glass inline-flex items-center justify-center px-6 py-3 transition-opacity hover:opacity-90"
          style={actionTextStyle}
        >
          SVG
        </a>
        <a
          href={`/p/${code}/download/png`}
          download
          className="emq-glass inline-flex items-center justify-center px-6 py-3 transition-opacity hover:opacity-90"
          style={actionTextStyle}
        >
          PNG
        </a>
        <button
          type="button"
          onClick={handleShare}
          className="emq-glass inline-flex items-center justify-center px-6 py-3 transition-opacity hover:opacity-90"
          style={{ ...actionTextStyle, minWidth: '143px' }}
        >
          {shareLabel}
        </button>
        <a
          href="/create"
          className="inline-flex items-center justify-center px-6 py-3 transition-opacity hover:opacity-90"
          style={{ ...actionTextStyle, backgroundColor: accentColor, color: '#101214' }}
        >
          CREATE YOUR OWN
        </a>
      </div>
    </div>
  );
}
