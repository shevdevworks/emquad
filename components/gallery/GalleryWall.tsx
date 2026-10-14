import Link from 'next/link';

export interface GalleryPoster {
  readonly code: string;
  readonly phrase: string;
  readonly svg: string;
}

export interface GalleryWallProps {
  readonly posters: readonly GalleryPoster[];
}

export function GalleryWall({ posters }: GalleryWallProps) {
  return (
    <div className="emq-gallery emq-enter">
      <style>{`
        .emq-gallery {
          width: 100%;
          max-width: 1320px;
          margin-inline: auto;
          display: flex;
          flex-direction: column;
          gap: 28px;
          padding-block: 16px 32px;
        }
        .emq-gallery-head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px 32px;
        }
        .emq-gallery-title {
          color: var(--emq-text);
          font-weight: 500;
          font-size: clamp(30px, 4vw, 44px);
          line-height: 1.05;
          letter-spacing: -0.02em;
        }
        /* Width-led, never height-led: the old wall shrank every poster until
           all sixteen fitted the window, which on a short laptop screen made
           them thumbnails. Now each card keeps a readable minimum and the
           page scrolls. */
        .emq-gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
          gap: 20px;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        @media (max-width: 479px) {
          .emq-gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        }
        .emq-gallery-card {
          display: block;
          border-radius: 4px;
          outline: 1px solid var(--emq-border);
          overflow: hidden;
          transition: transform var(--emq-base) var(--emq-ease), outline-color var(--emq-fast) var(--emq-ease);
        }
        .emq-gallery-poster { aspect-ratio: 0.8; }
        .emq-gallery-poster > svg { display: block; width: 100%; height: 100%; }
        @media (hover: hover) {
          .emq-gallery-card:hover { transform: translateY(-3px); outline-color: var(--emq-accent); }
        }
        .emq-gallery-card:focus-visible { outline: 2px solid var(--emq-accent); outline-offset: 3px; }
      `}</style>

      <div className="emq-gallery-head">
        <div className="flex flex-col gap-3">
          <p className="emq-kicker">Gallery</p>
          <h1 className="emq-gallery-title">
            {posters.length} phrases, {posters.length} shapes.
          </h1>
          <p className="emq-body" style={{ maxWidth: 520 }}>
            Every poster here came out of the editor. Open one to download it, or to start your own from its
            settings.
          </p>
        </div>
        <Link href="/create" className="emq-btn emq-btn--primary">
          Create a poster
        </Link>
      </div>

      <ul className="emq-gallery-grid">
        {posters.map((poster) => (
          <li key={poster.code}>
            <Link href={`/p/${poster.code}`} aria-label={poster.phrase} prefetch={false} className="emq-gallery-card">
              <div aria-hidden="true" className="emq-gallery-poster" dangerouslySetInnerHTML={{ __html: poster.svg }} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
