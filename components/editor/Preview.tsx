'use client';

import { useEffect, useState } from 'react';
import type { PosterSpec } from '@/lib/poster/types';

export interface PreviewProps {
  // null means the current spec is invalid; Preview keeps showing the last
  // successfully rendered SVG instead of calling render() with it.
  readonly spec: PosterSpec | null;
  readonly initialSvg: string;
  /** Told whether the latest spec has a layout in its mode; see tryRender in render.ts. */
  readonly onFitChange: (fits: boolean) => void;
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
}

export function Preview({ spec, initialSvg, onFitChange }: PreviewProps) {
  const [renderFn, setRenderFn] = useState<RenderFn | null>(null);
  const [rendered, setRendered] = useState<Rendered>({ svg: initialSvg, spec: null, fn: null, fits: true });

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
    setRendered({ svg: svg ?? rendered.svg, spec, fn: renderFn, fits: svg !== null });
  }

  // The parent's messages live in its own state, which cannot be set during
  // this component's render - hence an effect, firing only when the answer
  // actually changes.
  useEffect(() => {
    onFitChange(rendered.fits);
  }, [rendered.fits, onFitChange]);

  return <div className="emq-editor-preview-slot" dangerouslySetInnerHTML={{ __html: rendered.svg }} />;
}
