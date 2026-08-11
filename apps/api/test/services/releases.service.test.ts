import type { ReleaseListQuery, ReleaseStatus, UserRole } from '@quality-lab/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  getReleaseDetail,
  listReleases,
  type GetReleaseDetailDeps,
  type ListReleasesDeps,
} from '../../src/services/releases.service.js';
import { NotFoundError } from '../../src/services/errors.js';

interface FakeReleaseRow {
  id: string;
  releaseLabel: string;
  title: string;
  description: string | null;
  serviceName: string;
  status: ReleaseStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  creator: { id: string; name: string; role: UserRole };
}

function fakeReleaseRow(overrides: Partial<FakeReleaseRow> = {}): FakeReleaseRow {
  return {
    id: 'release-1',
    releaseLabel: 'payments-api@v1.0.0',
    title: 'Test release',
    description: null,
    serviceName: 'payments-api',
    status: 'draft',
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    version: 1,
    creator: { id: 'user-1', name: 'Ava Chen', role: 'engineer' },
    ...overrides,
  };
}

function baseQuery(overrides: Partial<ReleaseListQuery> = {}): ReleaseListQuery {
  return {
    sort: 'createdAt',
    order: 'desc',
    page: 1,
    limit: 20,
    status: undefined,
    service: undefined,
    q: undefined,
    createdBy: undefined,
    ...overrides,
  };
}

describe('listReleases', () => {
  it('passes filters, pagination, and sort through to the repository deps unchanged', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const deps: ListReleasesDeps = { findMany, count };

    await listReleases(
      deps,
      baseQuery({
        status: ['deployed', 'approved'],
        service: 'payments-api',
        q: 'hotfix',
        createdBy: 'user-1',
        sort: 'version',
        order: 'asc',
        page: 2,
        limit: 10,
      }),
    );

    expect(findMany).toHaveBeenCalledWith(
      { status: ['deployed', 'approved'], service: 'payments-api', q: 'hotfix', createdBy: 'user-1' },
      { offset: 10, limit: 10 },
      // sort=version maps to release_label internally, not the literal
      // version lock-counter column - see releases.service.ts.
      { column: 'releaseLabel', order: 'asc' },
    );
    expect(count).toHaveBeenCalledWith({
      status: ['deployed', 'approved'],
      service: 'payments-api',
      q: 'hotfix',
      createdBy: 'user-1',
    });
  });

  it('omits absent filters entirely rather than passing them as undefined', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const deps: ListReleasesDeps = { findMany, count };

    await listReleases(deps, baseQuery());

    expect(findMany).toHaveBeenCalledWith({}, { offset: 0, limit: 20 }, { column: 'createdAt', order: 'desc' });
    expect(count).toHaveBeenCalledWith({});
  });

  it('maps createdAt/updatedAt to ISO strings and excludes email from the creator', async () => {
    const row = fakeReleaseRow();
    const deps: ListReleasesDeps = {
      findMany: vi.fn().mockResolvedValue([row]),
      count: vi.fn().mockResolvedValue(1),
    };

    const result = await listReleases(deps, baseQuery());

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'release-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      creator: { id: 'user-1', name: 'Ava Chen', role: 'engineer' },
    });
    expect(Object.keys(result.data[0]?.creator ?? {})).not.toContain('email');
  });

  describe('pagination math', () => {
    it('total=0 -> zero pages, no next/prev, empty data', async () => {
      const deps: ListReleasesDeps = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      };

      const result = await listReleases(deps, baseQuery({ page: 1, limit: 20 }));

      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('first page of many -> hasNext true, hasPrev false', async () => {
      const deps: ListReleasesDeps = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(45),
      };

      const result = await listReleases(deps, baseQuery({ page: 1, limit: 20 }));

      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 45,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      });
    });

    it('last page -> hasNext false, hasPrev true', async () => {
      const deps: ListReleasesDeps = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(45),
      };

      const result = await listReleases(deps, baseQuery({ page: 3, limit: 20 }));

      expect(result.pagination).toEqual({
        page: 3,
        limit: 20,
        total: 45,
        totalPages: 3,
        hasNext: false,
        hasPrev: true,
      });
    });

    it('page beyond the last page -> empty data, still 200-shaped, hasNext false hasPrev true', async () => {
      const deps: ListReleasesDeps = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(45),
      };

      const result = await listReleases(deps, baseQuery({ page: 99, limit: 20 }));

      expect(result.data).toEqual([]);
      expect(result.pagination).toEqual({
        page: 99,
        limit: 20,
        total: 45,
        totalPages: 3,
        hasNext: false,
        hasPrev: true,
      });
    });
  });
});

describe('getReleaseDetail', () => {
  it('throws NotFoundError when the repository returns undefined', async () => {
    const deps: GetReleaseDetailDeps = {
      findById: vi.fn().mockResolvedValue(undefined),
      findTransitionsByReleaseId: vi.fn(),
      countCommentsByReleaseId: vi.fn(),
    };

    await expect(getReleaseDetail(deps, 'missing-id')).rejects.toThrow(NotFoundError);
    await expect(getReleaseDetail(deps, 'missing-id')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('assembles release + transitions + commentCount when found', async () => {
    const release = fakeReleaseRow();
    const transitionRow = {
      id: 'transition-1',
      fromStatus: null,
      toStatus: 'draft' as ReleaseStatus,
      reason: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      actor: { id: 'user-1', name: 'Ava Chen', role: 'engineer' as UserRole },
    };
    const deps: GetReleaseDetailDeps = {
      findById: vi.fn().mockResolvedValue(release),
      findTransitionsByReleaseId: vi.fn().mockResolvedValue([transitionRow]),
      countCommentsByReleaseId: vi.fn().mockResolvedValue(3),
    };

    const result = await getReleaseDetail(deps, 'release-1');

    expect(result.id).toBe('release-1');
    expect(result.commentCount).toBe(3);
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0]).toMatchObject({
      id: 'transition-1',
      toStatus: 'draft',
      actor: { id: 'user-1', name: 'Ava Chen', role: 'engineer' },
    });
  });
});
