import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { render } from '@/lib/poster/render';
import { FIXTURES, type FixtureCode } from '@/lib/poster/fixtures';

function isFixtureCode(code: string): code is FixtureCode {
  return code in FIXTURES;
}

export function generateStaticParams(): { code: FixtureCode }[] {
  return (Object.keys(FIXTURES) as FixtureCode[]).map((code) => ({ code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  if (!isFixtureCode(code)) return {};
  const spec = FIXTURES[code];
  return {
    title: spec.phrase,
    description: `A typographic poster: "${spec.phrase}"`,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isFixtureCode(code)) notFound();

  const spec = FIXTURES[code];
  const svg = render(spec);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-[640px]" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
