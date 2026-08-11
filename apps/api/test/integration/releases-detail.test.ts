import { randomUUID } from 'node:crypto';
import { ReleaseDetailSchema } from '@quality-lab/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { openTestApp, type TestApp } from './test-app.js';

describe('GET /releases/:id', () => {
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

  it('returns the release with creator summary, no email present', async () => {
    const target = fixture.releases[10];
    if (!target) throw new Error('expected fixture.releases[10] to exist');

    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${target.id}` });
    expect(response.statusCode).toBe(200);

    const body = ReleaseDetailSchema.parse(response.json());
    expect(body.id).toBe(target.id);
    expect(body.releaseLabel).toBe(target.releaseLabel);
    expect(body.creator).toMatchObject({ id: target.createdBy });
    expect(Object.keys(body.creator)).toEqual(['id', 'name', 'role']);
    expect(Object.keys(body.creator)).not.toContain('email');
  });

  it('returns the full ordered transition history for the reject-cycle release', async () => {
    // fixture.releases[0] is the guaranteed reject-cycle release: 3x
    // draft->submitted->rejected->draft plus the creation event = 10.
    const rejectCycleRelease = fixture.releases[0];
    if (!rejectCycleRelease) throw new Error('expected fixture.releases[0] to exist');

    const expectedTransitions = fixture.transitions
      .filter((t) => t.releaseId === rejectCycleRelease.id)
      .sort((a, b) => {
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
        return aTime - bTime;
      });
    expect(expectedTransitions).toHaveLength(10);

    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${rejectCycleRelease.id}` });
    const body = ReleaseDetailSchema.parse(response.json());

    expect(body.transitions).toHaveLength(10);
    expect(body.transitions.map((t) => `${t.fromStatus ?? 'null'}->${t.toStatus}`)).toEqual(
      expectedTransitions.map((t) => `${t.fromStatus ?? 'null'}->${t.toStatus}`),
    );
    expect(body.status).toBe('draft');
  });

  it('returns commentCount 0 for the guaranteed zero-comment release', async () => {
    const zeroCommentRelease = fixture.releases[1];
    if (!zeroCommentRelease) throw new Error('expected fixture.releases[1] to exist');

    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${zeroCommentRelease.id}` });
    const body = ReleaseDetailSchema.parse(response.json());

    expect(body.commentCount).toBe(0);
  });

  it('returns 404 with the standard envelope for an unknown but valid UUID', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${randomUUID()}` });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(body.error.requestId).toBeDefined();
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('returns 400, not 500, for a malformed id', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: '/releases/not-a-uuid' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('issues exactly 3 queries even for the release with the most transitions (no N+1)', async () => {
    const rejectCycleRelease = fixture.releases[0];
    if (!rejectCycleRelease) throw new Error('expected fixture.releases[0] to exist');

    testApp.queryCounter.reset();
    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${rejectCycleRelease.id}` });
    expect(response.statusCode).toBe(200);
    expect(testApp.queryCounter.count).toBe(3);
  });
});
