import type { Comment, CommentListQuery, CreateCommentRequest, SessionUser } from '@quality-lab/shared';
import type { Database } from '../db/client.js';
import * as commentsRepository from '../db/repositories/comments.repository.js';
import type { OffsetPagination } from '../db/repositories/releases.repository.js';
import * as releasesRepository from '../db/repositories/releases.repository.js';
import { NotFoundError } from './errors.js';
import { buildPaginationMeta } from './pagination.js';
import type { WriteResult } from './write-result.js';

type CommentRow = Awaited<ReturnType<typeof commentsRepository.findByReleaseId>>[number];

function toComment(row: CommentRow): Comment {
  if (!row.author) {
    throw new Error(`comment ${row.id} has no author (author_id is NOT NULL - data integrity bug)`);
  }
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
  };
}

export interface PaginatedComments {
  data: Comment[];
  pagination: ReturnType<typeof buildPaginationMeta>;
}

export interface ListReleaseCommentsDeps {
  releaseExists: (releaseId: string) => ReturnType<typeof releasesRepository.existsById>;
  findByReleaseId: (
    releaseId: string,
    pagination: OffsetPagination,
  ) => ReturnType<typeof commentsRepository.findByReleaseId>;
  countByReleaseId: (releaseId: string) => ReturnType<typeof commentsRepository.countByReleaseId>;
}

export function createListReleaseCommentsDeps(db: Database): ListReleaseCommentsDeps {
  return {
    releaseExists: (releaseId) => releasesRepository.existsById(db, releaseId),
    findByReleaseId: (releaseId, pagination) => commentsRepository.findByReleaseId(db, releaseId, pagination),
    countByReleaseId: (releaseId) => commentsRepository.countByReleaseId(db, releaseId),
  };
}

export async function listReleaseComments(
  deps: ListReleaseCommentsDeps,
  releaseId: string,
  query: CommentListQuery,
): Promise<PaginatedComments> {
  const exists = await deps.releaseExists(releaseId);
  if (!exists) {
    throw new NotFoundError('release', releaseId);
  }

  const pagination: OffsetPagination = { offset: (query.page - 1) * query.limit, limit: query.limit };

  const [rows, total] = await Promise.all([
    deps.findByReleaseId(releaseId, pagination),
    deps.countByReleaseId(releaseId),
  ]);

  return {
    data: rows.map(toComment),
    pagination: buildPaginationMeta(query.page, query.limit, total),
  };
}

export interface CreateCommentDeps {
  releaseExists: (releaseId: string) => ReturnType<typeof releasesRepository.existsById>;
  insert: (row: commentsRepository.InsertCommentRow) => ReturnType<typeof commentsRepository.insert>;
}

export function createCreateCommentDeps(db: Database): CreateCommentDeps {
  return {
    releaseExists: (releaseId) => releasesRepository.existsById(db, releaseId),
    insert: (row) => commentsRepository.insert(db, row),
  };
}

// Any authenticated user, any release state - no canTransition/state check
// at all, unlike releases/transitions writes.
export async function createComment(
  deps: CreateCommentDeps,
  params: { releaseId: string; actor: SessionUser | undefined; body: CreateCommentRequest },
): Promise<WriteResult<Comment>> {
  if (!params.actor) {
    return { ok: false, failure: { kind: 'unauthenticated' } };
  }

  const exists = await deps.releaseExists(params.releaseId);
  if (!exists) {
    throw new NotFoundError('release', params.releaseId);
  }

  const inserted = await deps.insert({
    releaseId: params.releaseId,
    authorId: params.actor.id,
    body: params.body.body,
  });

  return {
    ok: true,
    value: {
      id: inserted.id,
      body: inserted.body,
      createdAt: inserted.createdAt.toISOString(),
      author: { id: params.actor.id, name: params.actor.name, role: params.actor.role },
    },
  };
}
