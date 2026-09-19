import { Editor } from '@/components/editor/Editor';
import { render, tryRender } from '@/lib/poster/render';
import { DEFAULT_SPEC, searchParamsToSpec } from '@/lib/poster/url';

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
  // An address can carry a spec with no layout in its mode (a long word in an
  // airy grid). The editor still opens on that spec, so the visitor sees their
  // own phrase and the reason it does not fit; only the first frame falls
  // back to the default poster.
  const initialSvg = tryRender(spec) ?? render(DEFAULT_SPEC);

  return <Editor initialSpec={spec} initialSvg={initialSvg} />;
}
