import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// `tokenHash` is a SHA-256 digest of the raw random token the session
// cookie carries - never the token itself, so a leaked row can't be used
// to log in directly. SHA-256 (not argon2) is deliberate: the token is
// already 256 bits of CSPRNG entropy, not a user-chosen secret, so a slow
// KDF buys nothing and would tax every authenticated request. See
// docs/adr/0009-session-based-auth.md.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_key').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);
