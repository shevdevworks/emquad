import type { Mode } from '@/lib/poster/types';

export interface ModeIconProps {
  readonly mode: Mode;
  readonly className?: string;
}

// A diagram of each mode's silhouette - the same "blur it to blobs" criterion
// the modes are built to pass - drawn inside a poster-shaped frame. These are
// interface icons, not posters: a real render at this size is a grey smudge.
function Shapes({ mode }: { readonly mode: Mode }) {
  switch (mode) {
    case 'stack':
      return (
        <>
          <rect x="3.5" y="4" width="13" height="3.2" />
          <rect x="3.5" y="8.8" width="13" height="3.2" />
          <rect x="3.5" y="13.6" width="13" height="3.2" />
          <rect x="3.5" y="18.4" width="13" height="3.2" />
        </>
      );
    case 'break':
      return (
        <>
          <rect x="5" y="5" width="15" height="8" />
          <rect x="3.5" y="16" width="5" height="1.4" />
          <rect x="3.5" y="18.4" width="4" height="1.4" />
          <rect x="3.5" y="20.8" width="5.5" height="1.4" />
        </>
      );
    case 'grid':
      return (
        <>
          <rect x="3.5" y="3.5" width="5.8" height="2.6" />
          <rect x="10.7" y="3.5" width="5.8" height="5.8" opacity="0.45" />
          <rect x="3.5" y="10.7" width="13" height="2.6" />
          <rect x="3.5" y="16.6" width="5.8" height="5.8" opacity="0.45" />
          <rect x="10.7" y="17.9" width="5.8" height="2.6" />
        </>
      );
    case 'column':
      return (
        <>
          <rect x="3.5" y="3.5" width="6" height="2.2" />
          <rect x="3.5" y="7" width="6" height="2.2" />
          <rect x="3.5" y="10.5" width="6" height="2.2" />
          <rect x="3.5" y="14" width="6" height="2.2" />
        </>
      );
    case 'ring':
      return (
        <>
          <path d="M4.5 12.5 A5.5 5.5 0 0 1 15.5 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 17.5 A5 5 0 0 0 14 17.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="10" cy="14.5" r="2.6" />
        </>
      );
  }
}

export function ModeIcon({ mode, className }: ModeIconProps) {
  return (
    <svg
      viewBox="0 0 20 25"
      width="20"
      height="25"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      <rect x="0.6" y="0.6" width="18.8" height="23.8" rx="1.5" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" />
      <svg x="0" y="0" width="20" height="25" viewBox="0 0 20 25" overflow="hidden">
        <Shapes mode={mode} />
      </svg>
    </svg>
  );
}
