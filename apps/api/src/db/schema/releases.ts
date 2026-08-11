import { RELEASE_STATUSES } from '@quality-lab/shared';
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

const releaseStatusList = RELEASE_STATUSES.map((status) => `'${status}'`).join(', ');

export const releases = pgTable(
  'releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: text('version').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    serviceName: text('service_name').notNull(),
    status: text('status').notNull().default('draft'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('releases_version_key').on(table.version),
    // serves the approver queue / status filters, e.g. WHERE status = 'submitted'
    index('releases_status_idx').on(table.status),
    // serves "my releases" queries, e.g. WHERE created_by = :userId
    index('releases_created_by_idx').on(table.createdBy),
    // serves recency-ordered dashboard listings, e.g. ORDER BY created_at DESC LIMIT n
    index('releases_created_at_idx').on(table.createdAt.desc()),
    check('releases_status_check', sql`${table.status} in (${sql.raw(releaseStatusList)})`),
  ],
);
