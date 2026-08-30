import { Hero } from '@/components/home/Hero';

export default function Page() {
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
      <Hero />
    </div>
  );
}
