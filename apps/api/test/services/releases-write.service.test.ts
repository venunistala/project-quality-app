import type { ReleaseStatus, UserRole } from '@quality-lab/shared';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/services/errors.js';
import {
  createRelease,
  patchRelease,
  type CreateReleaseDeps,
  type PatchReleaseDeps,
} from '../../src/services/releases-write.service.js';

function makeActor(id: string, role: UserRole = 'engineer') {
  return { id, name: 'Actor', role, email: 'actor@quality-lab.dev' };
}

describe('createRelease', () => {
  it('rejects with unauthenticated when no actor, without opening a transaction', async () => {
    const runInTransaction = vi.fn();
    const deps: CreateReleaseDeps = { runInTransaction };

    const result = await createRelease(deps, {
      actor: undefined,
      body: { releaseLabel: 'svc@v1.0.0', title: 'Title', serviceName: 'svc' },
      requestId: 'req-1',
    });

    expect(result).toEqual({ ok: false, failure: { kind: 'unauthenticated' } });
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('runs the write inside a transaction and returns its result on success', async () => {
    // The real repository insert calls happen inside the transaction
    // callback and touch Drizzle directly - mocking runInTransaction itself
    // (rather than letting the real callback run against a fake tx) tests
    // createRelease's own decision (open a transaction, wrap its result as
    // ok:true) without needing a real DB. The callback's own SQL is covered
    // by integration tests.
    const fakeSummary = {
      id: 'release-1',
      releaseLabel: 'svc@v1.0.0',
      title: 'Title',
      description: 'desc',
      serviceName: 'svc',
      status: 'draft' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
      creator: { id: 'user-1', name: 'Actor', role: 'engineer' as const },
    };
    const runInTransaction = vi.fn().mockResolvedValue(fakeSummary);
    const deps: CreateReleaseDeps = { runInTransaction };

    const result = await createRelease(deps, {
      actor: makeActor('user-1', 'engineer'),
      body: { releaseLabel: 'svc@v1.0.0', title: 'Title', description: 'desc', serviceName: 'svc' },
      requestId: 'req-1',
    });

    expect(result).toEqual({ ok: true, value: fakeSummary });
    expect(runInTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('patchRelease', () => {
  interface FakeReleaseRow {
    id: string;
    status: ReleaseStatus;
    createdBy: string;
    creator: { id: string; name: string; role: UserRole };
  }

  function fakeRelease(overrides: Partial<FakeReleaseRow> = {}): FakeReleaseRow {
    return {
      id: 'release-1',
      status: 'draft',
      createdBy: 'creator-1',
      creator: { id: 'creator-1', name: 'Ava Chen', role: 'engineer' },
      ...overrides,
    };
  }

  function baseDeps(overrides: Partial<PatchReleaseDeps> = {}): PatchReleaseDeps {
    return {
      findById: vi.fn(),
      conditionalUpdatePatchFields: vi.fn(),
      findCurrentVersion: vi.fn(),
      ...overrides,
    };
  }

  it('rejects with unauthenticated when no actor', async () => {
    const findById = vi.fn();
    const deps = baseDeps({ findById });

    const result = await patchRelease(deps, {
      releaseId: 'release-1',
      actor: undefined,
      body: { title: 'New title', expectedVersion: 1 },
    });

    expect(result).toEqual({ ok: false, failure: { kind: 'unauthenticated' } });
    expect(findById).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the release does not exist', async () => {
    const deps = baseDeps({ findById: vi.fn().mockResolvedValue(undefined) });

    await expect(
      patchRelease(deps, {
        releaseId: 'missing',
        actor: makeActor('creator-1'),
        body: { title: 'New title', expectedVersion: 1 },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects with CONFLICT_NOT_DRAFT when the release is not in draft, even for the creator', async () => {
    const conditionalUpdatePatchFields = vi.fn();
    const deps = baseDeps({
      findById: vi.fn().mockResolvedValue(fakeRelease({ status: 'submitted' })),
      conditionalUpdatePatchFields,
    });

    const result = await patchRelease(deps, {
      releaseId: 'release-1',
      actor: makeActor('creator-1'),
      body: { title: 'New title', expectedVersion: 1 },
    });

    expect(result).toEqual({ ok: false, failure: { kind: 'conflict', code: 'CONFLICT_NOT_DRAFT' } });
    expect(conditionalUpdatePatchFields).not.toHaveBeenCalled();
  });

  it('rejects with FORBIDDEN_NOT_CREATOR when a draft release is patched by someone else', async () => {
    const conditionalUpdatePatchFields = vi.fn();
    const deps = baseDeps({
      findById: vi.fn().mockResolvedValue(fakeRelease({ status: 'draft', createdBy: 'creator-1' })),
      conditionalUpdatePatchFields,
    });

    const result = await patchRelease(deps, {
      releaseId: 'release-1',
      actor: makeActor('someone-else'),
      body: { title: 'New title', expectedVersion: 1 },
    });

    expect(result).toEqual({ ok: false, failure: { kind: 'forbidden', code: 'FORBIDDEN_NOT_CREATOR' } });
    expect(conditionalUpdatePatchFields).not.toHaveBeenCalled();
  });

  it('rejects with CONFLICT_STALE_VERSION and the current version when the conditional update affects no rows', async () => {
    const deps = baseDeps({
      findById: vi.fn().mockResolvedValue(fakeRelease()),
      conditionalUpdatePatchFields: vi.fn().mockResolvedValue(undefined),
      findCurrentVersion: vi.fn().mockResolvedValue(7),
    });

    const result = await patchRelease(deps, {
      releaseId: 'release-1',
      actor: makeActor('creator-1'),
      body: { title: 'New title', expectedVersion: 3 },
    });

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'conflict', code: 'CONFLICT_STALE_VERSION', currentVersion: 7 },
    });
  });

  it('returns the updated release, using the already-loaded creator, on success', async () => {
    const updatedRow = {
      id: 'release-1',
      releaseLabel: 'svc@v1.0.0',
      title: 'New title',
      description: null,
      serviceName: 'svc',
      status: 'draft' as ReleaseStatus,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      version: 2,
    };
    const deps = baseDeps({
      findById: vi.fn().mockResolvedValue(fakeRelease()),
      conditionalUpdatePatchFields: vi.fn().mockResolvedValue(updatedRow),
    });

    const result = await patchRelease(deps, {
      releaseId: 'release-1',
      actor: makeActor('creator-1'),
      body: { title: 'New title', expectedVersion: 1 },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'release-1',
        releaseLabel: 'svc@v1.0.0',
        title: 'New title',
        description: null,
        serviceName: 'svc',
        status: 'draft',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
        version: 2,
        creator: { id: 'creator-1', name: 'Ava Chen', role: 'engineer' },
      },
    });
  });
});
