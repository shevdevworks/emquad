import type { Metadata } from 'next';
import { GlobalChrome } from '@/components/global/GlobalChrome';

export const metadata: Metadata = {
  title: 'Create — Emquad',
  description: 'Poster editor.',
  alternates: { canonical: '/create' },
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <GlobalChrome mode="flow">{children}</GlobalChrome>;
}
