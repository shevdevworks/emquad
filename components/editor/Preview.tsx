'use client';

import { useEffect, useState } from 'react';
import type { PosterSpec } from '@/lib/poster/types';

export interface PreviewProps {
  // null means the current spec is invalid; Preview keeps showing the last
  // successfully rendered SVG instead of calling render() with it.
  readonly spec: PosterSpec | null;
  readonly initialSvg: string;
}

type RenderFn = (spec: PosterSpec) => string;

interface Rendered {
  readonly svg: string;
  /** The inputs `svg` was produced from; both null while the server frame is still showing. */
  readonly spec: PosterSpec | null;
  readonly fn: RenderFn | null;
}

export function Preview({ spec, initialSvg }: PreviewProps) {
  const [renderFn, setRenderFn] = useState<RenderFn | null>(null);
  const [rendered, setRendered] = useState<Rendered>({ svg: initialSvg, spec: null, fn: null });

  useEffect(() => {
    let cancelled = false;

    void import('@/lib/poster/render').then(({ render }) => {
      if (!cancelled) setRenderFn(() => render);
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
    setRendered({ svg: renderFn(spec), spec, fn: renderFn });
  }

  return <div className="emq-editor-preview-slot" dangerouslySetInnerHTML={{ __html: rendered.svg }} />;
}
