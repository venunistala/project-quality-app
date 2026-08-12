import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { auditLog, releases, transitions } from '../../src/db/schema/index.js';
import { openTestApp, type TestApp } from './test-app.js';
import { fixtureUserOfRole, insertDraftRelease, loginAs } from './write-test-helpers.js';

describe('POST /releases/:id/transitions', () => {
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

  it('happy path: approve a submitted release, writes transitions + audit_log rows, returns the bumped version', async () => {
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

    const approve = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      cookies: { session: approverSession.cookieValue },
      headers: { 'x-request-id': 'req-approve-1' },
      payload: { to: 'approved', expectedVersion: submitted.version },
    });

    expect(approve.statusCode).toBe(200);
    const body = approve.json();
    expect(body.status).toBe('approved');
    expect(body.version).toBe(submitted.version + 1);

    const [transitionRow] = await testApp.db
      .select()
      .from(transitions)
      .where(and(eq(transitions.releaseId, release.id), eq(transitions.toStatus, 'approved')));
    expect(transitionRow).toMatchObject({ fromStatus: 'submitted', toStatus: 'approved', actorId: approver.id });

    const [auditRow] = await testApp.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, release.id), eq(auditLog.action, 'release.approved')));
    expect(auditRow).toMatchObject({ actorId: approver.id, requestId: 'req-approve-1' });
  });

  it('401: rejects an unauthenticated request', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const release = await insertDraftRelease(testApp, creator.id);

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      payload: { to: 'submitted', expectedVersion: release.version },
    });
    expect(response.statusCode).toBe(401);
  });

  it('403: an engineer cannot approve a submitted release (requires the approver role)', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const otherEngineer = fixtureUserOfRole(fixture, 'engineer', creator.id);
    const creatorSession = await loginAs(testApp, creator.email);
    const otherSession = await loginAs(testApp, otherEngineer.email);

    const release = await insertDraftRelease(testApp, creator.id);
    const submit = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      cookies: { session: creatorSession.cookieValue },
      payload: { to: 'submitted', expectedVersion: release.version },
    });
    const submitted = submit.json();

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      cookies: { session: otherSession.cookieValue },
      payload: { to: 'approved', expectedVersion: submitted.version },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN_ROLE' } });
  });

  it('403: an approver cannot approve their own release (self-approval)', async () => {
    const approverCreator = fixtureUserOfRole(fixture, 'approver');
    const session = await loginAs(testApp, approverCreator.email);

    const release = await insertDraftRelease(testApp, approverCreator.id);
    const submit = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      cookies: { session: session.cookieValue },
      payload: { to: 'submitted', expectedVersion: release.version },
    });
    const submitted = submit.json();

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      cookies: { session: session.cookieValue },
      payload: { to: 'approved', expectedVersion: submitted.version },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN_SELF_APPROVAL' } });
  });

  it('409: rejects an illegal transition (draft straight to approved)', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, creator.email);
    const release = await insertDraftRelease(testApp, creator.id);

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      cookies: { session: session.cookieValue },
      payload: { to: 'approved', expectedVersion: release.version },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'CONFLICT_ILLEGAL_TRANSITION' } });
  });

  it('409: stale version - rejects when the release changed after the client loaded it, and reports the current version', async () => {
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

    // Simulate another write bumping the version without changing status,
    // so canTransition still allows submitted->approved but the client's
    // remembered version is now stale.
    await testApp.db.update(releases).set({ version: submitted.version + 1 }).where(eq(releases.id, release.id));

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      cookies: { session: approverSession.cookieValue },
      payload: { to: 'approved', expectedVersion: submitted.version },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.error.code).toBe('CONFLICT_STALE_VERSION');
    expect(body.error.currentVersion).toBe(submitted.version + 1);
  });

  it('400: rejects an unknown target status', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, creator.email);
    const release = await insertDraftRelease(testApp, creator.id);

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/transitions`,
      cookies: { session: session.cookieValue },
      payload: { to: 'not-a-real-status', expectedVersion: release.version },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
