import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { PosterParams } from '@/lib/poster/types';

export const posters = pgTable('posters', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  phrase: text('phrase').notNull(),
  params: jsonb('params').$type<PosterParams>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  inGallery: boolean('in_gallery').notNull().default(false),
});

export type PosterRow = typeof posters.$inferSelect;
export type NewPosterRow = typeof posters.$inferInsert;
