import { notFound } from 'next/navigation';

// Exists only so unmatched top-level addresses land on the (fixed) route
// group's own not-found.tsx and get GlobalChrome - without it they fall
// through to the root default with no chrome at all.
export default function CatchAll(): never {
  notFound();
}
