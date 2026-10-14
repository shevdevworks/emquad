import { GlobalChrome } from '@/components/global/GlobalChrome';

export default function FixedLayout({ children }: { children: React.ReactNode }) {
  return <GlobalChrome backdrop="smoke">{children}</GlobalChrome>;
}
