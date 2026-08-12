import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { transitions } from '../../src/db/schema/index.js';
import { openTestApp, type TestApp } from './test-app.js';
import { fixtureUserOfRole, insertDraftRelease, loginAs } from './write-test-helpers.js';

describe('POST /releases/:id/transitions - concurrency', () => {
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

  it('two simultaneous approve requests with the same expectedVersion: exactly one 200, one 409, one transitions row', async () => {
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
    const submitted = submit.json();

    const fireApprove = () =>
      testApp.app.inject({
        method: 'POST',
        url: `/releases/${release.id}/transitions`,
        cookies: { session: approverSession.cookieValue },
        payload: { to: 'approved', expectedVersion: submitted.version },
      });

    const [first, second] = await Promise.all([fireApprove(), fireApprove()]);
    const statusCodes = [first?.statusCode, second?.statusCode].sort();

    expect(statusCodes).toEqual([200, 409]);

    const loser = first?.statusCode === 409 ? first : second;
    expect(loser?.json()).toMatchObject({ error: { code: 'CONFLICT_STALE_VERSION' } });

    const approvedTransitions = await testApp.db
      .select()
      .from(transitions)
      .where(and(eq(transitions.releaseId, release.id), eq(transitions.toStatus, 'approved')));
    expect(approvedTransitions).toHaveLength(1);
  });
});
