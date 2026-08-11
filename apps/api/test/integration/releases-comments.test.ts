import { randomUUID } from 'node:crypto';
import { CommentSchema, paginated } from '@quality-lab/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { openTestApp, type TestApp } from './test-app.js';

const CommentsResponseSchema = paginated(CommentSchema);

function findReleaseIdWithAtLeastComments(fixture: Fixture, minimum: number): string {
  const counts = new Map<string, number>();
  for (const comment of fixture.comments) {
    counts.set(comment.releaseId, (counts.get(comment.releaseId) ?? 0) + 1);
  }
  for (const [releaseId, count] of counts) {
    if (count >= minimum) {
      return releaseId;
    }
  }
  throw new Error(`no seeded release has at least ${minimum} comments`);
}

describe('GET /releases/:id/comments', () => {
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

  it('returns an empty page for the guaranteed zero-comment release', async () => {
    const zeroCommentRelease = fixture.releases[1];
    if (!zeroCommentRelease) throw new Error('expected fixture.releases[1] to exist');

    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${zeroCommentRelease.id}/comments` });
    expect(response.statusCode).toBe(200);

    const body = CommentsResponseSchema.parse(response.json());
    expect(body.data).toEqual([]);
    expect(body.pagination).toMatchObject({ total: 0, totalPages: 0, hasNext: false, hasPrev: false });
  });

  it('returns comments with author summaries and correct pagination math', async () => {
    const releaseId = findReleaseIdWithAtLeastComments(fixture, 3);
    const expectedTotal = fixture.comments.filter((c) => c.releaseId === releaseId).length;

    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${releaseId}/comments?limit=2` });
    const body = CommentsResponseSchema.parse(response.json());

    expect(body.pagination.total).toBe(expectedTotal);
    expect(body.data.length).toBeLessThanOrEqual(2);
    for (const comment of body.data) {
      expect(comment.author).toHaveProperty('id');
      expect(comment.author).toHaveProperty('name');
      expect(comment.author).toHaveProperty('role');
      expect(Object.keys(comment.author)).not.toContain('email');
    }
  });

  it('returns an empty page beyond the last page', async () => {
    const releaseId = findReleaseIdWithAtLeastComments(fixture, 1);

    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${releaseId}/comments?page=999` });
    const body = CommentsResponseSchema.parse(response.json());

    expect(body.data).toEqual([]);
    expect(response.statusCode).toBe(200);
  });

  it('returns 404 for an unknown but valid release id', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${randomUUID()}/comments` });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('returns 400, not 500, for a malformed release id', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: '/releases/not-a-uuid/comments' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('issues exactly 3 queries regardless of comment count (no N+1)', async () => {
    const releaseId = findReleaseIdWithAtLeastComments(fixture, 3);

    testApp.queryCounter.reset();
    const response = await testApp.app.inject({ method: 'GET', url: `/releases/${releaseId}/comments` });
    expect(response.statusCode).toBe(200);
    expect(testApp.queryCounter.count).toBe(3);
  });
});
