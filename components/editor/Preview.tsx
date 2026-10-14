'use client';

import { useEffect, useState } from 'react';
import type { PosterSpec } from '@/lib/poster/types';
import { splitWords } from '@/lib/poster/validate';

export interface PreviewProps {
  // null means the current spec is invalid; Preview keeps showing the last
  // successfully rendered SVG instead of calling render() with it.
  readonly spec: PosterSpec | null;
  readonly initialSvg: string;
  /** Told whether the latest spec has a layout in its mode; see tryRender in render.ts. */
  readonly onFitChange: (fits: boolean) => void;
  /**
   * Set when the poster on screen is not the one the current input describes
   * - the input breaks a rule, or has no layout in its mode. The last good
   * frame stays up so the screen does not flash, but it is dimmed and labelled
   * so nobody mistakes it for the result of what they typed.
   */
  readonly staleNote: string | null;
  readonly staleNoteId: string;
}

// tryRender, not render: a valid spec can still have no layout in its mode,
// and a throw here would take the whole editor down with it.
type RenderFn = (spec: PosterSpec) => string | null;

interface Rendered {
  readonly svg: string;
  /** The inputs `svg` was produced from; both null while the server frame is still showing. */
  readonly spec: PosterSpec | null;
  readonly fn: RenderFn | null;
  /** False when the latest spec could not be laid out; `svg` then still holds the last frame that could. */
  readonly fits: boolean;
  /** The spec the visible frame actually shows - differs from `spec` when that one did not fit. */
  readonly shown: PosterSpec | null;
}

/** What the poster on screen shows, in words, for screen readers. */
function describePoster(spec: PosterSpec | null): string {
  if (spec === null) return 'Poster preview';
  const { mode, density, grain, invert, accent } = spec.params;
  const words = splitWords(spec.phrase);
  const parts = [
    `${mode} composition`,
    `${density} density`,
    grain === 0 ? 'no grain' : `grain ${grain}`,
    invert ? 'black on white' : 'white on black',
  ];
  if (accent !== null && words[accent] !== undefined) parts.push(`accent on "${words[accent].toUpperCase()}"`);
  return `Poster preview reading "${spec.phrase.toUpperCase()}": ${parts.join(', ')}.`;
}

export function Preview({ spec, initialSvg, onFitChange, staleNote, staleNoteId }: PreviewProps) {
  const [renderFn, setRenderFn] = useState<RenderFn | null>(null);
  const [rendered, setRendered] = useState<Rendered>({
    svg: initialSvg,
    spec: null,
    fn: null,
    fits: true,
    shown: null,
  });

  useEffect(() => {
    let cancelled = false;

    void import('@/lib/poster/render').then(({ tryRender }) => {
      if (!cancelled) setRenderFn(() => tryRender);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Rendering during render, not in an effect: the SVG is derived from the
  // props, so an effect would only add a second pass (see React's "You Might
  // Not Need an Effect", adjusting state when props change). React discards
  // this pass's output and re-runs the component immediately, before the
  // browser sees anything. The guard makes this run once per new spec, and an
  // invalid spec (null) simply keeps the last good SVG on screen.
  if (spec !== null && renderFn !== null && (spec !== rendered.spec || renderFn !== rendered.fn)) {
    const svg = renderFn(spec);
    setRendered({
      svg: svg ?? rendered.svg,
      spec,
      fn: renderFn,
      fits: svg !== null,
      shown: svg !== null ? spec : rendered.shown,
    });
  }

  // The parent's messages live in its own state, which cannot be set during
  // this component's render - hence an effect, firing only when the answer
  // actually changes.
  useEffect(() => {
    onFitChange(rendered.fits);
  }, [rendered.fits, onFitChange]);

  const stale = staleNote !== null;

  return (
    <div className="emq-editor-preview-frame" data-stale={stale}>
      <div
        className="emq-editor-preview-slot"
        role="img"
        aria-label={describePoster(rendered.shown ?? spec)}
        aria-describedby={stale ? staleNoteId : undefined}
        dangerouslySetInnerHTML={{ __html: rendered.svg }}
      />
      {stale && (
        <p id={staleNoteId} className="emq-editor-stale">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 6v3.6M8 11.4v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {staleNote}
        </p>
      )}
    </div>
  );
}
