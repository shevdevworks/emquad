'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';

// The in-site history this page session has walked, oldest first. A bare
// router.back() cannot be trusted on its own here: the project's main
// feature is a poster link opened straight out of a messenger, so the very
// first screen a visitor sees is often /p/[code], and "back" from there
// would take them off the site entirely.
//
// A stack rather than a "has navigated" flag: the flag never turned off, so
// after one step in and one step back, the next BACK left the site anyway.
// Returning to the path just below the top is read as a back step and pops
// it; anything else is a step forward. The one misread - following a link to
// the page you just came from - only makes BACK go home early, never off
// the site.
//
// Module scope rather than component state: the site has two layouts,
// (fixed) and /create, which mount separate GlobalChrome trees. Crossing
// between them unmounts every component here, so any hook-held value would
// be lost exactly when it matters. The module lives as long as the document.
const visited: string[] = [];

function recordVisit(pathname: string) {
  if (visited[visited.length - 1] === pathname) return; // remount or Strict Mode re-run, not a move
  if (visited.length >= 2 && visited[visited.length - 2] === pathname) {
    visited.pop();
  } else {
    visited.push(pathname);
  }
}

/**
 * Feeds the stack. Called by the site header, which is mounted on every page
 * - including home, where BackLink itself is hidden but the visit still counts.
 */
export function useSiteHistory() {
  const pathname = usePathname();
  useEffect(() => {
    recordVisit(pathname);
  }, [pathname]);
}

export interface BackLinkProps {
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function BackLink({ className, style }: BackLinkProps) {
  const router = useRouter();

  function handleClick() {
    if (visited.length > 1) {
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
