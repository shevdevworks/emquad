import { posterSlug, posterFileName } from '../lib/poster/filename';

const CASES: { label: string; phrase: string; code: string }[] = [
  { label: 'latin, 3 words', phrase: 'poster starts here', code: 'up4hrme3' },
  { label: 'cyrillic, 3 words', phrase: 'снег идёт молча', code: 'wvdcrs3x' },
  { label: '7 words', phrase: 'this poster has exactly seven words total', code: 'abc12345' },
  { label: 'digits', phrase: 'room 42 opens at 9 sharp', code: 'xyz98765' },
  { label: 'spaces and hyphens only', phrase: '  --- - --  ', code: 'code0001' },
];

for (const { label, phrase, code } of CASES) {
  const slug = posterSlug(phrase);
  const png = posterFileName(phrase, code, 'png');
  console.log(`${label}\n  input: ${JSON.stringify(phrase)}\n  slug:  ${JSON.stringify(slug)}\n  name:  ${png}\n`);
}
