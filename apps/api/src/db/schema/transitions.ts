import { RELEASE_STATUSES } from '@quality-lab/shared';
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { releases } from './releases.js';
import { users } from './users.js';

const releaseStatusList = RELEASE_STATUSES.map((status) => `'${status}'`).join(', ');

export const transitions = pgTable(
  'transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    // null marks the creation event (the release's first row in this table)
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // serves "full transition history for a release, chronological"
    index('transitions_release_id_created_at_idx').on(table.releaseId, table.createdAt),
    check(
      'transitions_from_status_check',
      sql`${table.fromStatus} is null or ${table.fromStatus} in (${sql.raw(releaseStatusList)})`,
    ),
    check('transitions_to_status_check', sql`${table.toStatus} in (${sql.raw(releaseStatusList)})`),
  ],
);
