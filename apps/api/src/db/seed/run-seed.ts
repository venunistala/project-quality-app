import { sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { auditLog, comments, releases, transitions, users } from '../schema/index.js';
import { buildFixture } from './build-fixture.js';

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export interface SeedSummary {
  users: number;
  releases: number;
  transitions: number;
  comments: number;
  auditLog: number;
}

/**
 * Truncates and reloads the fixture data. Safe to call any number of times
 * (not only right after db:reset) - this is a test fixture, not demo data,
 * see the README's "Seed data" section.
 */
export async function runSeed(db: Database): Promise<SeedSummary> {
  const fixture = buildFixture();

  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table audit_log, comments, transitions, releases, users cascade`);

    for (const batch of chunk(fixture.users, 500)) {
      await tx.insert(users).values(batch);
    }
    for (const batch of chunk(fixture.releases, 500)) {
      await tx.insert(releases).values(batch);
    }
    for (const batch of chunk(fixture.transitions, 500)) {
      await tx.insert(transitions).values(batch);
    }
    for (const batch of chunk(fixture.comments, 500)) {
      await tx.insert(comments).values(batch);
    }
    for (const batch of chunk(fixture.auditLog, 500)) {
      await tx.insert(auditLog).values(batch);
    }
  });

  return {
    users: fixture.users.length,
    releases: fixture.releases.length,
    transitions: fixture.transitions.length,
    comments: fixture.comments.length,
    auditLog: fixture.auditLog.length,
  };
}
