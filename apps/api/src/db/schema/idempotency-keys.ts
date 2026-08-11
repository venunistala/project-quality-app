import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// requestPath is the literal invoked path (id already substituted), not a
// route template plus a nullable releaseId column - Postgres treats every
// NULL as distinct in a unique index, so a nullable releaseId would
// silently fail to deduplicate POST /releases (no release id) requests.
// See docs/adr/0014-idempotency-vs-optimistic-locking.md.
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    method: text('method').notNull(),
    requestPath: text('request_path').notNull(),
    requestHash: text('request_hash').notNull(),
    // Null while a claim is in-flight (the write hasn't completed yet).
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('idempotency_keys_key_user_method_path_key').on(
      table.key,
      table.userId,
      table.method,
      table.requestPath,
    ),
  ],
);
