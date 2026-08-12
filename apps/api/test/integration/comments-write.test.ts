import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { releases } from '../../src/db/schema/index.js';
import { openTestApp, type TestApp } from './test-app.js';
import { fixtureUserOfRole, insertDraftRelease, loginAs } from './write-test-helpers.js';

describe('POST /releases/:id/comments', () => {
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

  it('happy path: any authenticated user can comment, in any release state', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const commenter = fixtureUserOfRole(fixture, 'approver');
    const session = await loginAs(testApp, commenter.email);
    const release = await insertDraftRelease(testApp, creator.id);
    await testApp.db.update(releases).set({ status: 'deployed' }).where(eq(releases.id, release.id));

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/comments`,
      cookies: { session: session.cookieValue },
      payload: { body: 'Looks good to me.' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      body: 'Looks good to me.',
      author: { id: commenter.id, name: commenter.name, role: commenter.role },
    });
    expect(body.author.email).toBeUndefined();
  });

  it('401: rejects an unauthenticated request', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const release = await insertDraftRelease(testApp, creator.id);

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/comments`,
      payload: { body: 'hi' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('404: rejects a comment on an unknown release', async () => {
    const commenter = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, commenter.email);

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${randomUUID()}/comments`,
      cookies: { session: session.cookieValue },
      payload: { body: 'hi' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('400: rejects an empty comment body', async () => {
    const creator = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, creator.email);
    const release = await insertDraftRelease(testApp, creator.id);

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/releases/${release.id}/comments`,
      cookies: { session: session.cookieValue },
      payload: { body: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
