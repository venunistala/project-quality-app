import type { UserRole } from '@quality-lab/shared';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/services/errors.js';
import {
  createComment,
  listReleaseComments,
  type CreateCommentDeps,
  type ListReleaseCommentsDeps,
} from '../../src/services/comments.service.js';

interface FakeCommentRow {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string; role: UserRole };
}

function fakeCommentRow(overrides: Partial<FakeCommentRow> = {}): FakeCommentRow {
  return {
    id: 'comment-1',
    body: 'LGTM, ship it.',
    createdAt: new Date('2026-01-03T00:00:00.000Z'),
    author: { id: 'user-2', name: 'Liam Patel', role: 'engineer' },
    ...overrides,
  };
}

describe('listReleaseComments', () => {
  it('throws NotFoundError when the release does not exist', async () => {
    const deps: ListReleaseCommentsDeps = {
      releaseExists: vi.fn().mockResolvedValue(false),
      findByReleaseId: vi.fn(),
      countByReleaseId: vi.fn(),
    };

    await expect(listReleaseComments(deps, 'missing-release', { page: 1, limit: 20 })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('maps createdAt to an ISO string and excludes email from the author', async () => {
    const deps: ListReleaseCommentsDeps = {
      releaseExists: vi.fn().mockResolvedValue(true),
      findByReleaseId: vi.fn().mockResolvedValue([fakeCommentRow()]),
      countByReleaseId: vi.fn().mockResolvedValue(1),
    };

    const result = await listReleaseComments(deps, 'release-1', { page: 1, limit: 20 });

    expect(result.data[0]).toMatchObject({
      id: 'comment-1',
      createdAt: '2026-01-03T00:00:00.000Z',
      author: { id: 'user-2', name: 'Liam Patel', role: 'engineer' },
    });
    expect(Object.keys(result.data[0]?.author ?? {})).not.toContain('email');
  });

  it('zero comments -> empty data, zero pages', async () => {
    const deps: ListReleaseCommentsDeps = {
      releaseExists: vi.fn().mockResolvedValue(true),
      findByReleaseId: vi.fn().mockResolvedValue([]),
      countByReleaseId: vi.fn().mockResolvedValue(0),
    };

    const result = await listReleaseComments(deps, 'release-1', { page: 1, limit: 20 });

    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });

  it('computes offset from page/limit when calling the repository', async () => {
    const findByReleaseId = vi.fn().mockResolvedValue([]);
    const deps: ListReleaseCommentsDeps = {
      releaseExists: vi.fn().mockResolvedValue(true),
      findByReleaseId,
      countByReleaseId: vi.fn().mockResolvedValue(0),
    };

    await listReleaseComments(deps, 'release-1', { page: 3, limit: 10 });

    expect(findByReleaseId).toHaveBeenCalledWith('release-1', { offset: 20, limit: 10 });
  });
});

describe('createComment', () => {
  function baseDeps(overrides: Partial<CreateCommentDeps> = {}): CreateCommentDeps {
    return {
      releaseExists: vi.fn(),
      insert: vi.fn(),
      ...overrides,
    };
  }

  const actor = { id: 'user-2', name: 'Liam Patel', role: 'engineer' as UserRole, email: 'liam@quality-lab.dev' };

  it('rejects with unauthenticated when no actor, without checking the release', async () => {
    const releaseExists = vi.fn();
    const deps = baseDeps({ releaseExists });

    const result = await createComment(deps, { releaseId: 'release-1', actor: undefined, body: { body: 'hi' } });

    expect(result).toEqual({ ok: false, failure: { kind: 'unauthenticated' } });
    expect(releaseExists).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the release does not exist', async () => {
    const deps = baseDeps({ releaseExists: vi.fn().mockResolvedValue(false) });

    await expect(
      createComment(deps, { releaseId: 'missing', actor, body: { body: 'hi' } }),
    ).rejects.toThrow(NotFoundError);
  });

  it('inserts the comment and returns it, for any release state - no canTransition check', async () => {
    const insert = vi.fn().mockResolvedValue({
      id: 'comment-1',
      body: 'LGTM',
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
    });
    const deps = baseDeps({ releaseExists: vi.fn().mockResolvedValue(true), insert });

    const result = await createComment(deps, { releaseId: 'release-1', actor, body: { body: 'LGTM' } });

    expect(insert).toHaveBeenCalledWith({ releaseId: 'release-1', authorId: 'user-2', body: 'LGTM' });
    expect(result).toEqual({
      ok: true,
      value: {
        id: 'comment-1',
        body: 'LGTM',
        createdAt: '2026-01-05T00:00:00.000Z',
        author: { id: 'user-2', name: 'Liam Patel', role: 'engineer' },
      },
    });
  });
});
