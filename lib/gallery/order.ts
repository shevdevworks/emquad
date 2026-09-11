import type { PosterSpec } from '../poster/types';
import { specsDeepEqual } from '../../seed/gallery-checks';

export interface OrderableGalleryRow<T> {
  readonly spec: PosterSpec;
  readonly createdAt: Date;
  readonly source: T;
}

/**
 * Orders gallery rows to match seed/gallery.ts: each file spec claims the
 * first unclaimed row whose spec is a deep match (same algorithm as
 * matchSpecsToRows in seed/gallery-sync.ts). Rows with no match in the file
 * are appended, oldest first.
 */
export function orderGalleryRows<T>(
  rows: readonly OrderableGalleryRow<T>[],
  fileSpecsInOrder: readonly PosterSpec[],
): T[] {
  const claimed = new Set<number>();
  const ordered: T[] = [];

  for (const fileSpec of fileSpecsInOrder) {
    const index = rows.findIndex((row, i) => !claimed.has(i) && specsDeepEqual(row.spec, fileSpec));
    if (index === -1) continue;
    claimed.add(index);
    ordered.push(rows[index].source);
  }

  const unmatched = rows
    .map((row, i) => ({ row, i }))
    .filter(({ i }) => !claimed.has(i))
    .sort((a, b) => a.row.createdAt.getTime() - b.row.createdAt.getTime())
    .map(({ row }) => row.source);

  return [...ordered, ...unmatched];
}
