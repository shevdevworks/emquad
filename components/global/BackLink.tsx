'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';

// Whether this page session has already moved between two pages inside the
// site. A bare router.back() cannot be trusted on its own here: the project's
// main feature is a poster link opened straight out of a messenger, so the
// very first screen a visitor sees is often /p/[code], and "back" from there
// would take them off the site entirely.
//
// Module scope rather than component state: the site has two layouts,
// (fixed) and /create, which mount separate GlobalChrome trees. Crossing
// between them unmounts this component, so any hook-held value would be
// lost exactly when it matters. The module lives as long as the document.
let hasNavigatedInsideSite = false;
let lastPathname: string | null = null;

export interface BackLinkProps {
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function BackLink({ className, style }: BackLinkProps) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (lastPathname !== null && lastPathname !== pathname) {
      hasNavigatedInsideSite = true;
    }
    lastPathname = pathname;
  }, [pathname]);

  function handleClick() {
    if (hasNavigatedInsideSite) {
      router.back();
      return;
    }
    router.push('/');
  }

  return (
    <button type="button" className={className} style={style} onClick={handleClick}>
      BACK
    </button>
  );
}
