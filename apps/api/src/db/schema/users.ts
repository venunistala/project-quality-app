import { USER_ROLES, type UserRole } from '@quality-lab/shared';
import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const userRoleList = USER_ROLES.map((role) => `'${role}'`).join(', ');

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: text('role').$type<UserRole>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_key').on(table.email),
    check('users_role_check', sql`${table.role} in (${sql.raw(userRoleList)})`),
  ],
);
