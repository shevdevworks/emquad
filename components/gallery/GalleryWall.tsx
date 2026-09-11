import Link from 'next/link';
import { SITE_ACCENT, TEXT_MUTED, TEXT_PRIMARY } from '@/lib/theme';

export interface GalleryPoster {
  readonly code: string;
  readonly phrase: string;
  readonly svg: string;
}

export interface GalleryWallProps {
  readonly posters: readonly GalleryPoster[];
}

const kickerStyle = {
  color: TEXT_MUTED,
  fontFamily: 'Onest',
  fontWeight: 500,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  fontSize: '11px',
} as const;

export function GalleryWall({ posters }: GalleryWallProps) {
  return (
    <div className="emq-gallery-center">
      <style>{`
        .emq-gallery-center {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .emq-gallery-grid {
          --gw-poster: min(
            calc((100vw - 144px) / 6 - 18px),
            calc(((100dvh - 192px) / 3 - 18px) / 1.25)
          );
          display: grid;
          grid-template-columns: repeat(6, calc(var(--gw-poster) + 18px));
          grid-template-rows: repeat(3, calc(var(--gw-poster) * 1.25 + 18px));
          gap: 16px;
        }
        .emq-gallery-cell {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border-radius: 8px;
          padding: 16px;
          container-type: inline-size;
        }
        .emq-gallery-title {
          font-family: 'Onest';
          font-weight: 500;
          font-size: clamp(14px, 11cqi, 28px);
          line-height: 1.05;
          color: ${TEXT_PRIMARY};
          overflow-wrap: break-word;
        }
        .emq-gallery-card {
          box-sizing: border-box;
          display: flex;
          padding: 8px;
          border-radius: 8px;
          position: relative;
          transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 500ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 500ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .emq-gallery-poster {
          aspect-ratio: 0.8;
          height: 100%;
        }
        .emq-gallery-poster > svg {
          display: block;
          width: 100%;
          height: 100%;
        }
        .emq-gallery-create-button {
          box-sizing: border-box;
          display: block;
          width: 100%;
          background: ${SITE_ACCENT};
          color: #101214;
          font-family: 'Onest';
          font-weight: 500;
          font-size: 13px;
          letter-spacing: 0.08em;
          text-align: center;
          white-space: normal;
          border-radius: 8px;
          padding: 12px 16px;
        }

        @media (hover: hover) {
          .emq-gallery-card:hover {
            transform: scale(1.04);
            border-color: var(--gw-accent);
            box-shadow:
              0 0 32px 0 color-mix(in srgb, var(--gw-accent) 28%, transparent),
              inset 0 0 12px 0 color-mix(in srgb, var(--gw-accent) 20%, transparent);
            z-index: 1;
          }
        }
        .emq-gallery-card:focus-visible {
          transform: scale(1.04);
          border-color: var(--gw-accent);
          box-shadow:
            0 0 32px 0 color-mix(in srgb, var(--gw-accent) 28%, transparent),
            inset 0 0 12px 0 color-mix(in srgb, var(--gw-accent) 20%, transparent);
          z-index: 1;
        }

        @media (prefers-reduced-motion: reduce) {
          .emq-gallery-card {
            transition: border-color 500ms cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 500ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .emq-gallery-card:hover,
          .emq-gallery-card:focus-visible {
            transform: none;
          }
        }

        @media (max-width: 1023px) {
          .emq-gallery-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-template-rows: none;
            grid-auto-rows: auto;
            gap: 16px;
            width: 100%;
          }
          .emq-gallery-cell--header,
          .emq-gallery-cell--create {
            grid-column: 1 / -1;
            height: auto;
          }
          .emq-gallery-card {
            aspect-ratio: 0.8;
          }
          .emq-gallery-poster {
            width: 100%;
            height: 100%;
          }
        }
      `}</style>

      <div className="emq-gallery-grid" style={{ ['--gw-accent' as string]: SITE_ACCENT }}>
        <div className="emq-glass emq-gallery-cell emq-gallery-cell--header">
          <span style={kickerStyle}>GALLERY</span>
          <h1 className="emq-gallery-title">Sixteen phrases, sixteen shapes.</h1>
        </div>

        {posters.map((poster) => (
          <Link
            key={poster.code}
            href={`/p/${poster.code}`}
            aria-label={poster.phrase}
            prefetch={false}
            className="emq-glass emq-gallery-card"
          >
            <div aria-hidden="true" className="emq-gallery-poster" dangerouslySetInnerHTML={{ __html: poster.svg }} />
          </Link>
        ))}

        <div className="emq-glass emq-gallery-cell emq-gallery-cell--create">
          <span style={kickerStyle}>YOUR TURN</span>
          <Link href="/create" className="emq-gallery-create-button transition-opacity hover:opacity-90">
            CREATE YOUR OWN
          </Link>
        </div>
      </div>
    </div>
  );
}
