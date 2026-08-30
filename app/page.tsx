import { Hero } from '@/components/home/Hero';
import { render } from '@/lib/poster/render';
import { SHOWCASE_COMPOSITIONS } from '@/components/home/showcase-phrases';

export default async function Page() {
  const initialSpec = SHOWCASE_COMPOSITIONS[0];
  const initialSvg = render(initialSpec);

  return (
    <div className="h-dvh overflow-hidden emq-page-shell">
      <style>{`
        @media (max-width: 1023px) {
          .emq-page-shell {
            height: auto;
            min-height: 100dvh;
            overflow: visible;
          }
        }
      `}</style>
      <Hero initialSpec={initialSpec} initialSvg={initialSvg} />
    </div>
  );
}
