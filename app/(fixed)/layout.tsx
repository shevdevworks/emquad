import { GlobalChrome } from '@/components/global/GlobalChrome';

export default function FixedLayout({ children }: { children: React.ReactNode }) {
  return <GlobalChrome mode="fixed">{children}</GlobalChrome>;
}
