'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import type { Mode } from '@/lib/poster/types';
import { PNG_EXPORT_HEIGHT, PNG_EXPORT_WIDTH } from '@/lib/poster/filename';

export interface PosterDisplayProps {
  readonly svg: string;
  readonly code: string;
  readonly phrase: string;
  readonly mode: Mode;
  /** The editor opened on this poster's phrase and every one of its settings. */
  readonly editHref: string;
}

/**
 * Outcome of the last share attempt. 'failed' carries the address so it can
 * be shown for copying by hand - logging the error alone left the visitor
 * with a button that silently did nothing.
 */
type ShareState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'copied' }
  | { readonly kind: 'failed'; readonly url: string };

const COPIED_VISIBLE_MS = 2500;

export function PosterDisplay({ svg, code, phrase, mode, editHref }: PosterDisplayProps) {
  const [share, setShare] = useState<ShareState>({ kind: 'idle' });
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const editNoteId = `${id}-edit-note`;
  const manualUrlId = `${id}-manual-url`;

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function handleShare() {
    // Read on click, not at render: the server and the first client frame
    // would otherwise disagree about the address.
    const url = window.location.href;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      if (navigator.share) {
        await navigator.share({ title: phrase, url });
        setShare({ kind: 'idle' });
        return;
      }
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(url);
      setShare({ kind: 'copied' });
      resetTimer.current = setTimeout(() => setShare({ kind: 'idle' }), COPIED_VISIBLE_MS);
    } catch (err) {
      // Closing the system share sheet is a choice, not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setShare({ kind: 'failed', url });
    }
  }

  return (
    <div className="emq-poster-page emq-enter">
      <style>{`
        .emq-poster-page {
          flex: 1;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 28px;
          padding-block: 8px 16px;
          justify-items: center;
        }
        .emq-poster-art {
          width: min(100%, 480px);
          aspect-ratio: 0.8;
          border-radius: 4px;
          overflow: hidden;
          outline: 1px solid var(--emq-border);
        }
        .emq-poster-art > svg { display: block; width: 100%; height: 100%; }
        .emq-poster-aside {
          width: min(100%, 480px);
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .emq-poster-title {
          color: var(--emq-text);
          font-weight: 500;
          font-size: clamp(24px, 6vw, 30px);
          line-height: 1.1;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }
        .emq-poster-group { display: flex; flex-direction: column; gap: 10px; }
        .emq-poster-group + .emq-poster-group { padding-top: 20px; border-top: 1px solid var(--emq-border); }
        .emq-export-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .emq-export {
          display: flex;
          flex-direction: column;
          gap: 2px;
          align-items: flex-start;
          justify-content: center;
          min-height: 60px;
          padding: 10px 14px;
          text-align: left;
        }
        .emq-export-format { font-size: 15px; color: var(--emq-text); }
        .emq-export-detail { font-size: 12px; color: var(--emq-text-muted); font-variant-numeric: tabular-nums; }
        .emq-status { font-size: 13px; line-height: 1.45; color: var(--emq-text-muted); }
        .emq-status:empty { display: none; }
        .emq-manual-url {
          width: 100%;
          margin-top: 8px;
          border-radius: 8px;
          border: 1px solid var(--emq-border-strong);
          background: var(--emq-surface);
          color: var(--emq-text);
          font-size: 14px;
          padding: 10px 12px;
        }

        @media (min-width: 1024px) {
          .emq-poster-page {
            grid-template-columns: auto minmax(280px, 340px);
            justify-content: center;
            align-items: center;
            column-gap: clamp(40px, 5vw, 72px);
            padding-block: 16px;
          }
          .emq-poster-art {
            /* Height-led: as much of the viewport as the header leaves, never
               shrunk below a size that still reads as a poster - a short
               window scrolls instead. */
            width: calc(clamp(440px, 100dvh - 150px, 980px) * 0.8);
          }
          .emq-poster-aside { width: 100%; }
        }
      `}</style>

      <div
        className="emq-poster-art"
        role="img"
        aria-label={`Poster reading "${phrase.toUpperCase()}", ${mode} composition`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <div className="emq-poster-aside">
        <div className="flex flex-col gap-3">
          <p className="emq-kicker">
            {/* The code is case-sensitive in the address, so it keeps its own case. */}
            {mode} composition · <span style={{ textTransform: 'none' }}>{code}</span>
          </p>
          <h1 className="emq-poster-title">{phrase}</h1>
        </div>

        <div className="emq-poster-group">
          <Link href={editHref} className="emq-btn emq-btn--primary" aria-describedby={editNoteId}>
            Edit this poster
          </Link>
          <p id={editNoteId} className="emq-status">
            Opens the editor with this phrase and every setting. Saving there makes a new poster; this one stays as
            it is.
          </p>
        </div>

        <div className="emq-poster-group">
          <h2 className="emq-kicker">Download</h2>
          <div className="emq-export-grid">
            <a
              href={`/p/${code}/download/svg`}
              download
              className="emq-btn emq-btn--secondary emq-export"
              aria-label={`Download SVG, vector file that scales to any size`}
            >
              <span className="emq-export-format">SVG</span>
              <span className="emq-export-detail" aria-hidden="true">
                Vector, any size
              </span>
            </a>
            <a
              href={`/p/${code}/download/png`}
              download
              className="emq-btn emq-btn--secondary emq-export"
              aria-label={`Download PNG, ${PNG_EXPORT_WIDTH} by ${PNG_EXPORT_HEIGHT} pixels`}
            >
              <span className="emq-export-format">PNG</span>
              <span className="emq-export-detail" aria-hidden="true">
                {PNG_EXPORT_WIDTH} × {PNG_EXPORT_HEIGHT} px
              </span>
            </a>
          </div>
        </div>

        <div className="emq-poster-group">
          <h2 className="emq-kicker">Share</h2>
          <button type="button" onClick={() => void handleShare()} className="emq-btn emq-btn--secondary">
            Share link
          </button>
          <div className="emq-status" role="status">
            {share.kind === 'copied' && 'Link copied to the clipboard.'}
            {share.kind === 'failed' && (
              <>
                <label htmlFor={manualUrlId}>Could not copy automatically. Select the link and copy it:</label>
                <input
                  id={manualUrlId}
                  className="emq-manual-url"
                  type="text"
                  readOnly
                  value={share.url}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
