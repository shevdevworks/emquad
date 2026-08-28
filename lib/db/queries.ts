import { eq } from 'drizzle-orm';
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

export async function insertPoster(spec: PosterSpec): Promise<PosterRow> {
  const db = getDb();
  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      const [row] = await db
        .insert(posters)
        .values({ phrase: spec.phrase, params: spec.params, code })
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
