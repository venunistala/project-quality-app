import { RELEASE_STATUSES, USER_ROLES, canTransition, type ReleaseStatus, type UserRole } from '@quality-lab/shared';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/services/errors.js';
import { transitionRelease, type TransitionReleaseDeps } from '../../src/services/transitions.service.js';
import { denialReasonToFailure } from '../../src/services/write-result.js';

interface FakeReleaseRow {
  id: string;
  status: ReleaseStatus;
  createdBy: string;
  creator: { id: string; name: string; role: UserRole };
}

function fakeRelease(overrides: Partial<FakeReleaseRow> = {}): FakeReleaseRow {
  return {
    id: 'release-1',
    status: 'submitted',
    createdBy: 'creator-1',
    creator: { id: 'creator-1', name: 'Ava Chen', role: 'engineer' },
    ...overrides,
  };
}

function makeActor(id: string, role: UserRole) {
  return { id, name: 'Actor', role, email: 'actor@quality-lab.dev' };
}

function fakeUpdatedRow(status: ReleaseStatus) {
  return {
    id: 'release-1',
    releaseLabel: 'svc@v1.0.0',
    title: 'Title',
    description: null,
    serviceName: 'svc',
    status,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    version: 2,
  };
}

function baseDeps(overrides: Partial<TransitionReleaseDeps> = {}): TransitionReleaseDeps {
  return {
    findById: vi.fn(),
    runInTransaction: vi.fn(),
    enqueueJob: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('transitionRelease - unauthenticated', () => {
  it('rejects with unauthenticated when no actor, without touching the db', async () => {
    const findById = vi.fn();
    const deps = baseDeps({ findById });

    const result = await transitionRelease(deps, {
      releaseId: 'release-1',
      actor: undefined,
      body: { to: 'submitted', expectedVersion: 1 },
      requestId: 'req-1',
    });

    expect(result).toEqual({ ok: false, failure: { kind: 'unauthenticated' } });
    expect(findById).not.toHaveBeenCalled();
  });
});

describe('transitionRelease - not found', () => {
  it('throws NotFoundError when the release does not exist', async () => {
    const deps = baseDeps({ findById: vi.fn().mockResolvedValue(undefined) });

    await expect(
      transitionRelease(deps, {
        releaseId: 'missing',
        actor: makeActor('actor-1', 'approver'),
        body: { to: 'approved', expectedVersion: 1 },
        requestId: 'req-1',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('transitionRelease - stale version', () => {
  it('maps a stale conditional-update outcome to CONFLICT_STALE_VERSION and never enqueues a job', async () => {
    const release = fakeRelease({ status: 'draft', createdBy: 'creator-1' });
    const enqueueJob = vi.fn();
    const deps = baseDeps({
      findById: vi.fn().mockResolvedValue(release),
      runInTransaction: vi.fn().mockResolvedValue({ kind: 'stale', currentVersion: 5 }),
      enqueueJob,
    });

    const result = await transitionRelease(deps, {
      releaseId: 'release-1',
      actor: makeActor('creator-1', 'engineer'),
      body: { to: 'submitted', expectedVersion: 1 },
      requestId: 'req-1',
    });

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'conflict', code: 'CONFLICT_STALE_VERSION', currentVersion: 5 },
    });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});

describe('transitionRelease - happy path detail', () => {
  it('enqueues a job and returns the updated release on a legal transition', async () => {
    const release = fakeRelease({ status: 'draft', createdBy: 'creator-1' });
    const runInTransaction = vi.fn().mockResolvedValue({ kind: 'ok', updated: fakeUpdatedRow('submitted') });
    const enqueueJob = vi.fn().mockResolvedValue(undefined);
    const deps = baseDeps({ findById: vi.fn().mockResolvedValue(release), runInTransaction, enqueueJob });

    const result = await transitionRelease(deps, {
      releaseId: 'release-1',
      actor: makeActor('creator-1', 'engineer'),
      body: { to: 'submitted', expectedVersion: 1 },
      requestId: 'req-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('submitted');
      expect(result.value.version).toBe(2);
      expect(result.value.creator).toEqual({ id: 'creator-1', name: 'Ava Chen', role: 'engineer' });
    }
    expect(enqueueJob).toHaveBeenCalledWith({
      jobType: 'release.transitioned',
      payload: { releaseId: 'release-1', toStatus: 'submitted' },
    });
  });
});

describe('transitionRelease - authorization matrix (every role x every from/to pair, both isCreator values)', () => {
  for (const from of RELEASE_STATUSES) {
    for (const to of RELEASE_STATUSES) {
      for (const role of USER_ROLES) {
        for (const isCreator of [true, false]) {
          it(`from=${from} to=${to} role=${role} isCreator=${String(isCreator)}`, async () => {
            const actorId = isCreator ? 'creator-1' : 'other-1';
            const release = fakeRelease({ status: from, createdBy: 'creator-1' });
            const runInTransaction = vi.fn().mockResolvedValue({ kind: 'ok', updated: fakeUpdatedRow(to) });
            const enqueueJob = vi.fn().mockResolvedValue(undefined);
            const deps = baseDeps({ findById: vi.fn().mockResolvedValue(release), runInTransaction, enqueueJob });

            const result = await transitionRelease(deps, {
              releaseId: 'release-1',
              actor: makeActor(actorId, role),
              body: { to, expectedVersion: 1 },
              requestId: 'req-1',
            });

            const expected = canTransition({ from, to, actorRole: role, isCreator });
            if (expected.allowed) {
              expect(result.ok).toBe(true);
              expect(runInTransaction).toHaveBeenCalledTimes(1);
              expect(enqueueJob).toHaveBeenCalledTimes(1);
            } else {
              expect(result).toEqual({ ok: false, failure: denialReasonToFailure(expected.reason) });
              expect(runInTransaction).not.toHaveBeenCalled();
              expect(enqueueJob).not.toHaveBeenCalled();
            }
          });
        }
      }
    }
  }
});
