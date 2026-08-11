import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { releases } from './releases.js';
import { users } from './users.js';

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // serves "comments for a release"
    index('comments_release_id_idx').on(table.releaseId),
  ],
);
