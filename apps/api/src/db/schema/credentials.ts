import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// Deliberately not a column on `users` - user rows are embedded verbatim
// into release/transition/comment responses via `with: { creator: {...} }`,
// so keeping the hash physically outside that table means a future
// careless `with: { creator: true }` (no column allow-list) can never leak
// it. See docs/adr/0009-session-based-auth.md.
export const credentials = pgTable('credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'restrict' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
