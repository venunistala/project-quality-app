import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// Append-only. No update or delete code path exists anywhere in this
// codebase for this table - that discipline is enforced by never writing
// one, not by a trigger (see docs/adr/0004-denormalized-release-status.md
// on why triggers are avoided project-wide).
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type').notNull(),
  // Polymorphic - entityType names which table entityId refers to, so it
  // cannot be a single-table foreign key (see docs/adr/0002-fk-delete-semantics.md).
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  payload: jsonb('payload').notNull().default({}),
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
