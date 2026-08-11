import { count } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db/client.js';
import { auditLog, comments, releases, transitions, users } from '../../src/db/schema/index.js';
import { runSeed } from '../../src/db/seed/run-seed.js';
import { openTestDb } from './test-db.js';

async function countRows(db: Database, table: PgTable): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table);
  if (!row) {
    throw new Error('count() query returned no rows');
  }
  return row.value;
}

async function rowCounts(db: Database): Promise<{
  users: number;
  releases: number;
  transitions: number;
  comments: number;
  auditLog: number;
}> {
  const [userCount, releaseCount, transitionCount, commentCount, auditLogCount] = await Promise.all([
    countRows(db, users),
    countRows(db, releases),
    countRows(db, transitions),
    countRows(db, comments),
    countRows(db, auditLog),
  ]);

  return {
    users: userCount,
    releases: releaseCount,
    transitions: transitionCount,
    comments: commentCount,
    auditLog: auditLogCount,
  };
}

describe('seed idempotency', () => {
  let client: ReturnType<typeof openTestDb>['client'];
  let db: Database;

  beforeAll(() => {
    ({ client, db } = openTestDb());
  });

  afterAll(async () => {
    await client.end();
  });

  it('produces 12 users and 200 releases with a coherent history', async () => {
    const summary = await runSeed(db);

    expect(summary.users).toBe(12);
    expect(summary.releases).toBe(200);
    expect(summary.auditLog).toBe(summary.transitions);

    expect(await rowCounts(db)).toEqual(summary);
  });

  it('is idempotent when run again (safe to run any number of times)', async () => {
    const first = await runSeed(db);
    const second = await runSeed(db);

    expect(second).toEqual(first);
    expect(await rowCounts(db)).toEqual(second);
  });
});
