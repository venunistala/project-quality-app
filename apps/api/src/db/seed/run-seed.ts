import { sql } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import type { Database } from '../client.js';
import { auditLog, comments, credentials, releases, transitions, users } from '../schema/index.js';
import { hashPassword } from '../../security/password.js';
import { buildFixture, type Fixture } from './build-fixture.js';
import { SEED_USER_PASSWORD } from './fixtures.js';

type CredentialInsert = InferInsertModel<typeof credentials>;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Defensive, not just a CLI-level check - assertNotProduction runs inside
// seedDatabase itself so no caller (script, test, future admin endpoint)
// can trigger a production seed by skipping db/seed.ts.
function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. Seeded users get a known dev-only password (see README).',
    );
  }
}

export interface SeedSummary {
  users: number;
  releases: number;
  transitions: number;
  comments: number;
  auditLog: number;
  credentials: number;
}

async function seedDatabase(db: Database): Promise<{ fixture: Fixture; summary: SeedSummary }> {
  assertNotProduction();

  const fixture = buildFixture();
  // Hashed once and reused for every seeded user - it's the same known dev
  // password for all of them, so there's no reason to pay argon2's cost 12
  // times.
  const passwordHash = await hashPassword(SEED_USER_PASSWORD);
  const credentialRows: CredentialInsert[] = fixture.users.map((user) => {
    // buildUsers() always sets an explicit id; InferInsertModel only marks
    // it optional because the column has a DB-side default.
    if (!user.id) {
      throw new Error('seeded user is missing an id');
    }
    return { userId: user.id, passwordHash };
  });

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`truncate table audit_log, comments, transitions, releases, credentials, sessions, users cascade`,
    );

    for (const batch of chunk(fixture.users, 500)) {
      await tx.insert(users).values(batch);
    }
    for (const batch of chunk(credentialRows, 500)) {
      await tx.insert(credentials).values(batch);
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
    fixture,
    summary: {
      users: fixture.users.length,
      releases: fixture.releases.length,
      transitions: fixture.transitions.length,
      comments: fixture.comments.length,
      auditLog: fixture.auditLog.length,
      credentials: credentialRows.length,
    },
  };
}

/**
 * Truncates and reloads the fixture data. Safe to call any number of times
 * (not only right after db:reset) - this is a test fixture, not demo data,
 * see the README's "Seed data" section.
 */
export async function runSeed(db: Database): Promise<SeedSummary> {
  const { summary } = await seedDatabase(db);
  return summary;
}

/**
 * Same as runSeed, but also returns the exact Fixture object that was
 * inserted - used by integration tests that need to assert against the
 * seeded data's own computed values (ids, labels, timestamps) rather than
 * calling buildFixture() a second time, which would produce slightly
 * different timestamps (anchored to whenever that second call happens to
 * run) even though the ids/relationships stay identical.
 */
export async function seedAndGetFixture(db: Database): Promise<{ fixture: Fixture; summary: SeedSummary }> {
  return seedDatabase(db);
}
