import { and, count, eq, inArray } from 'drizzle-orm';
import { getDb } from './client';
import { posters, type PosterRow } from './schema';
import { generateCode } from '@/lib/code';
import type { PosterSpec } from '@/lib/poster/types';

const MAX_INSERT_ATTEMPTS = 5;

export async function getPosterByCode(code: string): Promise<PosterRow | null> {
  const db = getDb();
  const rows = await db.select().from(posters).where(eq(posters.code, code)).limit(1);
  return rows[0] ?? null;
}

export function posterSpecFromRow(row: PosterRow): PosterSpec {
  return { phrase: row.phrase, params: row.params };
}

export async function insertPoster(
  spec: PosterSpec,
  options?: { readonly inGallery?: boolean },
): Promise<PosterRow> {
  const db = getDb();
  const inGallery = options?.inGallery ?? false;
  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      const [row] = await db
        .insert(posters)
        .values({ phrase: spec.phrase, params: spec.params, code, inGallery })
        .returning();
      return row;
    } catch (error) {
      const isUniqueViolation =
        typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
      if (!isUniqueViolation || attempt === MAX_INSERT_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error('Unreachable');
}

export async function listGalleryPosters(): Promise<PosterRow[]> {
  const db = getDb();
  return db.select().from(posters).where(eq(posters.inGallery, true));
}

export async function countPosters(): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ n: count() }).from(posters);
  return row.n;
}

export async function deletePostersByCode(codes: readonly string[]): Promise<readonly string[]> {
  const db = getDb();
  if (codes.length === 0) return [];
  const rows = await db
    .delete(posters)
    .where(and(inArray(posters.code, codes), eq(posters.inGallery, false)))
    .returning({ code: posters.code });
  return rows.map((r) => r.code);
}
