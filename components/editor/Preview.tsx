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

export function Preview({ spec, initialSvg }: PreviewProps) {
  const [svg, setSvg] = useState(initialSvg);
  const [renderFn, setRenderFn] = useState<RenderFn | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import('@/lib/poster/render').then(({ render }) => {
      if (!cancelled) setRenderFn(() => render);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (spec !== null && renderFn !== null) {
      setSvg(renderFn(spec));
    }
  }, [spec, renderFn]);

  return <div className="emq-editor-preview-slot" dangerouslySetInnerHTML={{ __html: svg }} />;
}
