import { GlobalChrome } from '@/components/global/GlobalChrome';

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <GlobalChrome mode="flow">{children}</GlobalChrome>;
}
