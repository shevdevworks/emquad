import { Editor } from '@/components/editor/Editor';
import { render } from '@/lib/poster/render';
import { searchParamsToSpec } from '@/lib/poster/url';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string') urlParams.set(key, first);
  }

  const spec = searchParamsToSpec(urlParams);
  const initialSvg = render(spec);

  return <Editor initialSpec={spec} initialSvg={initialSvg} />;
}
