import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { releases } from '../../src/db/schema/index.js';
import { openTestApp, type TestApp } from './test-app.js';
import { fixtureUserOfRole, insertDraftRelease, loginAs } from './write-test-helpers.js';

describe('PATCH /releases/:id', () => {
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

  it('happy path: the creator edits their own draft release and version increments', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, creator.email);
    const release = await insertDraftRelease(testApp, creator.id);

    const response = await testApp.app.inject({
      method: 'PATCH',
      url: `/releases/${release.id}`,
      cookies: { session: session.cookieValue },
      payload: { title: 'Updated title', expectedVersion: release.version },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe('Updated title');
    expect(body.version).toBe(release.version + 1);
  });

  it('401: rejects an unauthenticated request', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const release = await insertDraftRelease(testApp, creator.id);

    const response = await testApp.app.inject({
      method: 'PATCH',
      url: `/releases/${release.id}`,
      payload: { title: 'x', expectedVersion: release.version },
    });
    expect(response.statusCode).toBe(401);
  });

  it('403: rejects a non-creator editing a draft release', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const someoneElse = fixtureUserOfRole(fixture, 'engineer', creator.id);
    const session = await loginAs(testApp, someoneElse.email);
    const release = await insertDraftRelease(testApp, creator.id);

    const response = await testApp.app.inject({
      method: 'PATCH',
      url: `/releases/${release.id}`,
      cookies: { session: session.cookieValue },
      payload: { title: 'x', expectedVersion: release.version },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN_NOT_CREATOR' } });
  });

  it('409: rejects editing a release that is not in draft', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, creator.email);
    const release = await insertDraftRelease(testApp, creator.id);
    await testApp.db.update(releases).set({ status: 'submitted' }).where(eq(releases.id, release.id));

    const response = await testApp.app.inject({
      method: 'PATCH',
      url: `/releases/${release.id}`,
      cookies: { session: session.cookieValue },
      payload: { title: 'x', expectedVersion: release.version },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'CONFLICT_NOT_DRAFT' } });
  });

  it('409: stale version - a second edit with an outdated expectedVersion is rejected with the current version', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, creator.email);
    const release = await insertDraftRelease(testApp, creator.id);

    const first = await testApp.app.inject({
      method: 'PATCH',
      url: `/releases/${release.id}`,
      cookies: { session: session.cookieValue },
      payload: { title: 'First edit', expectedVersion: release.version },
    });
    expect(first.statusCode).toBe(200);

    const second = await testApp.app.inject({
      method: 'PATCH',
      url: `/releases/${release.id}`,
      cookies: { session: session.cookieValue },
      payload: { title: 'Second edit, stale', expectedVersion: release.version },
    });

    expect(second.statusCode).toBe(409);
    const body = second.json();
    expect(body.error.code).toBe('CONFLICT_STALE_VERSION');
    expect(body.error.currentVersion).toBe(release.version + 1);
  });

  it('400: rejects a body with no editable fields', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, creator.email);
    const release = await insertDraftRelease(testApp, creator.id);

    const response = await testApp.app.inject({
      method: 'PATCH',
      url: `/releases/${release.id}`,
      cookies: { session: session.cookieValue },
      payload: { expectedVersion: release.version },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
