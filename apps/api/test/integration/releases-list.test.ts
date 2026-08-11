import { paginated, ReleaseSummarySchema } from '@quality-lab/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { openTestApp, type TestApp } from './test-app.js';

const ListResponseSchema = paginated(ReleaseSummarySchema);

function assertSorted<T extends { id: string }>(
  rows: T[],
  getKey: (row: T) => string,
  order: 'asc' | 'desc',
): void {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    if (!prev || !curr) continue;
    const prevKey = getKey(prev);
    const currKey = getKey(curr);
    if (prevKey === currKey) {
      expect(prev.id <= curr.id).toBe(true); // id asc tiebreaker
    } else if (order === 'asc') {
      expect(prevKey <= currKey).toBe(true);
    } else {
      expect(prevKey >= currKey).toBe(true);
    }
  }
}

describe('GET /releases', () => {
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

  it('filters by a single status and validates the response against the shared schema', async () => {
    const expectedCount = fixture.releases.filter((r) => r.status === 'deployed').length;

    const response = await testApp.app.inject({ method: 'GET', url: '/releases?status=deployed&limit=100' });
    expect(response.statusCode).toBe(200);

    const body = ListResponseSchema.parse(response.json());
    expect(body.pagination.total).toBe(expectedCount);
    for (const release of body.data) {
      expect(release.status).toBe('deployed');
    }
  });

  it('filters by multiple repeated status values (OR semantics)', async () => {
    const expectedCount = fixture.releases.filter(
      (r) => r.status === 'deployed' || r.status === 'approved',
    ).length;

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/releases?status=deployed&status=approved&limit=1',
    });
    expect(response.statusCode).toBe(200);

    const body = ListResponseSchema.parse(response.json());
    expect(body.pagination.total).toBe(expectedCount);
  });

  it('filters by service_name exact match', async () => {
    const targetService = fixture.releases[0]?.serviceName;
    expect(targetService).toBeDefined();
    const expectedCount = fixture.releases.filter((r) => r.serviceName === targetService).length;

    const response = await testApp.app.inject({
      method: 'GET',
      url: `/releases?service=${encodeURIComponent(targetService ?? '')}&limit=100`,
    });
    const body = ListResponseSchema.parse(response.json());

    expect(body.pagination.total).toBe(expectedCount);
    for (const release of body.data) {
      expect(release.serviceName).toBe(targetService);
    }
  });

  it('searches title with a prefix-safe ILIKE match', async () => {
    // fixture.releases[3] is the guaranteed unicode/emoji-title release.
    const unicodeRelease = fixture.releases[3];
    expect(unicodeRelease).toBeDefined();
    const prefix = (unicodeRelease?.title ?? '').slice(0, 4);

    const response = await testApp.app.inject({
      method: 'GET',
      url: `/releases?q=${encodeURIComponent(prefix)}`,
    });
    const body = ListResponseSchema.parse(response.json());

    expect(body.data.some((r) => r.id === unicodeRelease?.id)).toBe(true);
  });

  it('filters by createdBy', async () => {
    const targetUser = fixture.users[0];
    expect(targetUser).toBeDefined();
    const expectedCount = fixture.releases.filter((r) => r.createdBy === targetUser?.id).length;

    const response = await testApp.app.inject({
      method: 'GET',
      url: `/releases?createdBy=${targetUser?.id}&limit=100`,
    });
    const body = ListResponseSchema.parse(response.json());

    expect(body.pagination.total).toBe(expectedCount);
    for (const release of body.data) {
      expect(release.creator.id).toBe(targetUser?.id);
    }
  });

  it.each([
    ['createdAt', 'asc'] as const,
    ['createdAt', 'desc'] as const,
    ['updatedAt', 'asc'] as const,
    ['updatedAt', 'desc'] as const,
    // sort=version maps to release_label internally (see the Phase 2 plan
    // note) - every seeded row ties at the literal version=1, so this is
    // the only sort where a value-based check would be meaningless; the
    // tiebreaker-determinism test below covers it instead.
    ['version', 'asc'] as const,
    ['version', 'desc'] as const,
  ])('sorts by %s %s', async (sort, order) => {
    const response = await testApp.app.inject({
      method: 'GET',
      url: `/releases?sort=${sort}&order=${order}&limit=100`,
    });
    const body = ListResponseSchema.parse(response.json());

    const key = sort === 'version' ? 'releaseLabel' : sort;
    assertSorted(body.data, (row) => row[key as 'createdAt' | 'updatedAt' | 'releaseLabel'], order);
  });

  describe('pagination', () => {
    it('returns the first page with hasNext true, hasPrev false', async () => {
      const response = await testApp.app.inject({ method: 'GET', url: '/releases?limit=20&page=1' });
      const body = ListResponseSchema.parse(response.json());

      expect(body.pagination).toMatchObject({ page: 1, limit: 20, total: 200, totalPages: 10 });
      expect(body.pagination.hasNext).toBe(true);
      expect(body.pagination.hasPrev).toBe(false);
      expect(body.data).toHaveLength(20);
    });

    it('returns the last page with hasNext false, hasPrev true', async () => {
      const response = await testApp.app.inject({ method: 'GET', url: '/releases?limit=20&page=10' });
      const body = ListResponseSchema.parse(response.json());

      expect(body.pagination.hasNext).toBe(false);
      expect(body.pagination.hasPrev).toBe(true);
      expect(body.data).toHaveLength(20);
    });

    it('returns an empty page, still 200, beyond the last page', async () => {
      const response = await testApp.app.inject({ method: 'GET', url: '/releases?limit=20&page=99' });
      expect(response.statusCode).toBe(200);

      const body = ListResponseSchema.parse(response.json());
      expect(body.data).toEqual([]);
      expect(body.pagination.hasNext).toBe(false);
      expect(body.pagination.hasPrev).toBe(true);
    });

    it('clamps a limit above the ceiling to 100', async () => {
      const response = await testApp.app.inject({ method: 'GET', url: '/releases?limit=500' });
      const body = ListResponseSchema.parse(response.json());

      expect(body.pagination.limit).toBe(100);
      expect(body.data).toHaveLength(100);
    });

    it('clamps a limit below the floor to 1', async () => {
      const response = await testApp.app.inject({ method: 'GET', url: '/releases?limit=0' });
      const body = ListResponseSchema.parse(response.json());

      expect(body.pagination.limit).toBe(1);
      expect(body.data).toHaveLength(1);
    });
  });

  it('keeps a stable, deterministic order for the two releases sharing one created_at', async () => {
    const a = fixture.releases[4];
    const b = fixture.releases[5];
    if (!a?.createdAt || !b?.createdAt) {
      throw new Error('expected fixture.releases[4] and [5] to have createdAt set');
    }
    expect(a.createdAt.getTime()).toBe(b.createdAt.getTime());

    const first = await testApp.app.inject({ method: 'GET', url: '/releases?sort=createdAt&order=asc&limit=100' });
    const second = await testApp.app.inject({ method: 'GET', url: '/releases?sort=createdAt&order=asc&limit=100' });

    const firstIds = ListResponseSchema.parse(first.json()).data.map((r) => r.id);
    const secondIds = ListResponseSchema.parse(second.json()).data.map((r) => r.id);
    expect(firstIds).toEqual(secondIds);
  });

  it('rejects an invalid status value with 400', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: '/releases?status=not-a-real-status' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects a malformed createdBy with 400', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: '/releases?createdBy=not-a-uuid' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('echoes x-request-id and sets Cache-Control: no-store', async () => {
    const response = await testApp.app.inject({
      method: 'GET',
      url: '/releases',
      headers: { 'x-request-id': 'releases-list-test-id' },
    });
    expect(response.headers['x-request-id']).toBe('releases-list-test-id');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('issues exactly 2 queries regardless of result size (no N+1)', async () => {
    testApp.queryCounter.reset();
    const response = await testApp.app.inject({ method: 'GET', url: '/releases?limit=100' });
    expect(response.statusCode).toBe(200);
    expect(testApp.queryCounter.count).toBe(2);
  });
});
