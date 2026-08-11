import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// The "simple DB-table enqueue" stub the Phase 3 spec explicitly asks for
// instead of a real queue. No consumer/worker reads from this table yet -
// Phase 5 owns dispatch. See docs/adr/0016-side-effects-after-commit.md.
export const jobQueue = pgTable('job_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobType: text('job_type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
