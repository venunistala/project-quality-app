import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { releases, transitions } from '../../src/db/schema/index.js';
import { openTestApp, type TestApp } from './test-app.js';
import { fixtureUserOfRole, insertDraftRelease, loginAs } from './write-test-helpers.js';

const TEMP_CONSTRAINT_NAME = 'temp_reject_release_approved_for_rollback_test';

describe('POST /releases/:id/transitions - rollback', () => {
  let testApp: TestApp;
  let fixture: Fixture;

  beforeAll(async () => {
    testApp = await openTestApp();
    const seeded = await seedAndGetFixture(testApp.db);
    fixture = seeded.fixture;
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
    await testApp.client.end();
  });

  it('a mid-transaction audit_log failure rolls back the status update AND the transitions insert', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const approver = fixtureUserOfRole(fixture, 'approver', creator.id);
    const creatorSession = await loginAs(testApp, creator.email);
    const approverSession = await loginAs(testApp, approver.email);

    const release = await insertDraftRelease(testApp, creator.id);
    const submit = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      cookies: { session: creatorSession.cookieValue },
      payload: { to: 'submitted', expectedVersion: release.version },
    });
    expect(submit.statusCode).toBe(200);
    const submitted = submit.json();

    // Force the audit_log insert for this specific transition to fail -
    // this is the "most people skip it" test: prove the status update and
    // the transitions insert roll back together with it, inside the same
    // db.transaction(), rather than leaving a half-applied write.
    await testApp.db.execute(
      sql`alter table audit_log add constraint ${sql.raw(TEMP_CONSTRAINT_NAME)} check (action <> 'release.approved')`,
    );

    try {
      const response = await testApp.app.inject({
        method: 'POST',
        url: `/releases/${release.id}/transitions`,
        cookies: { session: approverSession.cookieValue },
        payload: { to: 'approved', expectedVersion: submitted.version },
      });

      expect(response.statusCode).toBe(500);

      const [releaseAfter] = await testApp.db.select().from(releases).where(eq(releases.id, release.id));
      expect(releaseAfter?.status).toBe('submitted');
      expect(releaseAfter?.version).toBe(submitted.version);

      const approvedTransitions = await testApp.db
        .select()
        .from(transitions)
        .where(and(eq(transitions.releaseId, release.id), eq(transitions.toStatus, 'approved')));
      expect(approvedTransitions).toHaveLength(0);
    } finally {
      await testApp.db.execute(sql`alter table audit_log drop constraint ${sql.raw(TEMP_CONSTRAINT_NAME)}`);
    }
  });
});
