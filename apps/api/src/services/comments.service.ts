import type { Comment, CommentListQuery } from '@quality-lab/shared';
import type { Database } from '../db/client.js';
import * as commentsRepository from '../db/repositories/comments.repository.js';
import type { OffsetPagination } from '../db/repositories/releases.repository.js';
import * as releasesRepository from '../db/repositories/releases.repository.js';
import { NotFoundError } from './errors.js';
import { buildPaginationMeta } from './pagination.js';

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
