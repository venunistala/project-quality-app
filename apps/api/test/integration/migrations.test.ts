import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db/client.js';
import { openTestDb } from './test-db.js';

describe('migrations', () => {
  let client: ReturnType<typeof openTestDb>['client'];
  let db: Database;

  beforeAll(() => {
    ({ client, db } = openTestDb());
  });

  afterAll(async () => {
    await client.end();
  });

  it('creates all five tables', async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      'audit_log',
      'comments',
      'releases',
      'transitions',
      'users',
    ]);
  });

  it('creates the expected columns on releases', async () => {
    const rows = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'releases'
          order by ordinal_position`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'id',
      'version',
      'title',
      'description',
      'service_name',
      'status',
      'created_by',
      'created_at',
      'updated_at',
    ]);
  });

  it('creates the expected CHECK constraints', async () => {
    const rows = await db.execute<{ constraint_name: string }>(
      sql`select constraint_name from information_schema.table_constraints
          where constraint_type = 'CHECK' and table_schema = 'public'
          order by constraint_name`,
    );
    const names = rows.map((row) => row.constraint_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'users_role_check',
        'releases_status_check',
        'transitions_from_status_check',
        'transitions_to_status_check',
      ]),
    );
  });

  it('creates the expected foreign keys', async () => {
    const rows = await db.execute<{ constraint_name: string }>(
      sql`select constraint_name from information_schema.table_constraints
          where constraint_type = 'FOREIGN KEY' and table_schema = 'public'
          order by constraint_name`,
    );
    const names = rows.map((row) => row.constraint_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'audit_log_actor_id_users_id_fk',
        'comments_release_id_releases_id_fk',
        'comments_author_id_users_id_fk',
        'releases_created_by_users_id_fk',
        'transitions_release_id_releases_id_fk',
        'transitions_actor_id_users_id_fk',
      ]),
    );
  });

  it('creates the expected indexes, including the unique ones', async () => {
    // Drizzle's uniqueIndex()/index() both emit CREATE [UNIQUE] INDEX, not
    // ALTER TABLE ADD CONSTRAINT - they show up in pg_indexes, not in
    // information_schema.table_constraints.
    const rows = await db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where schemaname = 'public' order by indexname`,
    );
    const names = rows.map((row) => row.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'users_email_key',
        'releases_version_key',
        'releases_status_idx',
        'releases_created_by_idx',
        'releases_created_at_idx',
        'transitions_release_id_created_at_idx',
        'comments_release_id_idx',
      ]),
    );
  });
});
