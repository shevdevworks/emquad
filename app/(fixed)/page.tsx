import type { Metadata } from 'next';
import { Hero } from '@/components/home/Hero';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function Page() {
  return <Hero />;
}
