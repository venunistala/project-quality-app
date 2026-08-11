import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db/client.js';
import { auditLog, comments, releases, transitions, users } from '../../src/db/schema/index.js';
import { openTestDb } from './test-db.js';

// Postgres SQLSTATE error codes this file asserts against.
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

describe('constraints', () => {
  let client: ReturnType<typeof openTestDb>['client'];
  let db: Database;

  beforeAll(() => {
    ({ client, db } = openTestDb());
  });

  afterAll(async () => {
    await client.end();
  });

  async function insertUser(role: 'engineer' | 'approver' | 'admin' = 'engineer') {
    const [user] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@constraints.test`, name: 'Constraint Test User', role })
      .returning();
    if (!user) {
      throw new Error('insert did not return a row');
    }
    return user;
  }

  async function insertRelease(createdBy: string) {
    const [release] = await db
      .insert(releases)
      .values({ releaseLabel: `v-${randomUUID()}`, title: 'Constraint test release', serviceName: 'svc', createdBy })
      .returning();
    if (!release) {
      throw new Error('insert did not return a row');
    }
    return release;
  }

  describe('unique constraints', () => {
    it('rejects a duplicate user email', async () => {
      const email = `${randomUUID()}@constraints.test`;
      await db.insert(users).values({ email, name: 'First', role: 'engineer' });

      await expect(
        db.insert(users).values({ email, name: 'Second', role: 'engineer' }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it('rejects a duplicate release_label', async () => {
      const creator = await insertUser();
      const releaseLabel = `dup-${randomUUID()}`;
      await db.insert(releases).values({ releaseLabel, title: 'A', serviceName: 'svc', createdBy: creator.id });

      await expect(
        db.insert(releases).values({ releaseLabel, title: 'B', serviceName: 'svc', createdBy: creator.id }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });
  });

  describe('foreign key orphan rejection', () => {
    it('rejects a release referencing an unknown created_by', async () => {
      await expect(
        db
          .insert(releases)
          .values({ releaseLabel: `v-${randomUUID()}`, title: 'A', serviceName: 'svc', createdBy: randomUUID() }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it('rejects a transition referencing an unknown release_id', async () => {
      const actor = await insertUser();

      await expect(
        db.insert(transitions).values({ releaseId: randomUUID(), toStatus: 'draft', actorId: actor.id }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it('rejects a comment referencing an unknown author_id', async () => {
      const creator = await insertUser();
      const release = await insertRelease(creator.id);

      await expect(
        db.insert(comments).values({ releaseId: release.id, authorId: randomUUID(), body: 'hi' }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it('rejects an audit_log row referencing an unknown actor_id', async () => {
      await expect(
        db.insert(auditLog).values({
          entityType: 'release',
          entityId: randomUUID(),
          action: 'release.created',
          actorId: randomUUID(),
          payload: {},
        }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });
  });

  describe('FK delete semantics (ADR 0002)', () => {
    it('RESTRICTs deleting a user referenced by a release', async () => {
      const creator = await insertUser();
      await insertRelease(creator.id);

      await expect(db.delete(users).where(eq(users.id, creator.id))).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
      });
    });

    it('CASCADEs deleting a release into its transitions and comments', async () => {
      const creator = await insertUser();
      const release = await insertRelease(creator.id);
      await db.insert(transitions).values({ releaseId: release.id, toStatus: 'draft', actorId: creator.id });
      await db.insert(comments).values({ releaseId: release.id, authorId: creator.id, body: 'hi' });

      await db.delete(releases).where(eq(releases.id, release.id));

      const remainingTransitions = await db.select().from(transitions).where(eq(transitions.releaseId, release.id));
      const remainingComments = await db.select().from(comments).where(eq(comments.releaseId, release.id));
      expect(remainingTransitions).toHaveLength(0);
      expect(remainingComments).toHaveLength(0);
    });
  });

  describe('status CHECK constraint (ADR 0003)', () => {
    it('rejects an invalid release status via a raw insert', async () => {
      const creator = await insertUser();

      await expect(
        db.execute(
          sql`insert into releases (release_label, title, service_name, status, created_by)
              values (${`v-${randomUUID()}`}, 'A', 'svc', 'not-a-real-status', ${creator.id})`,
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });
  });
});
