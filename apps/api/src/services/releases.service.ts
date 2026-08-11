import type {
  ReleaseDetail,
  ReleaseListQuery,
  ReleaseSortField,
  ReleaseSummary,
  Transition,
} from '@quality-lab/shared';
import type { Database } from '../db/client.js';
import * as commentsRepository from '../db/repositories/comments.repository.js';
import type { OffsetPagination, ReleaseFilters, ReleaseSort, ReleaseSortColumn } from '../db/repositories/releases.repository.js';
import * as releasesRepository from '../db/repositories/releases.repository.js';
import * as transitionsRepository from '../db/repositories/transitions.repository.js';
import { NotFoundError } from './errors.js';
import { buildPaginationMeta } from './pagination.js';

type ReleaseRow = NonNullable<Awaited<ReturnType<typeof releasesRepository.findById>>>;
type TransitionRow = Awaited<ReturnType<typeof transitionsRepository.findByReleaseId>>[number];

// The public query value stays "version" for API-surface compatibility with
// the original spec, but every seeded release currently ties at version=1
// (the optimistic-lock counter, unused until Phase 3 - see ADR 0006), so
// sorting by the literal column would be a no-op. It maps instead to
// release_label, the business release identifier - confirmed with the user
// since the schema was renamed after this endpoint was likely spec'd.
const SORT_COLUMN_MAP: Record<ReleaseSortField, ReleaseSortColumn> = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'releaseLabel',
};

function toReleaseSummary(row: ReleaseRow): ReleaseSummary {
  if (!row.creator) {
    throw new Error(`release ${row.id} has no creator (created_by is NOT NULL - data integrity bug)`);
  }
  return {
    id: row.id,
    releaseLabel: row.releaseLabel,
    title: row.title,
    description: row.description,
    serviceName: row.serviceName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    creator: row.creator,
  };
}

function toTransition(row: TransitionRow): Transition {
  if (!row.actor) {
    throw new Error(`transition ${row.id} has no actor (actor_id is NOT NULL - data integrity bug)`);
  }
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
  };
}

export interface PaginatedReleases {
  data: ReleaseSummary[];
  pagination: ReturnType<typeof buildPaginationMeta>;
}

export interface ListReleasesDeps {
  findMany: (
    filters: ReleaseFilters,
    pagination: OffsetPagination,
    sort: ReleaseSort,
  ) => ReturnType<typeof releasesRepository.findMany>;
  count: (filters: ReleaseFilters) => ReturnType<typeof releasesRepository.count>;
}

export function createListReleasesDeps(db: Database): ListReleasesDeps {
  return {
    findMany: (filters, pagination, sort) => releasesRepository.findMany(db, filters, pagination, sort),
    count: (filters) => releasesRepository.count(db, filters),
  };
}

export async function listReleases(deps: ListReleasesDeps, query: ReleaseListQuery): Promise<PaginatedReleases> {
  const filters: ReleaseFilters = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.service ? { service: query.service } : {}),
    ...(query.q ? { q: query.q } : {}),
    ...(query.createdBy ? { createdBy: query.createdBy } : {}),
  };
  const pagination: OffsetPagination = { offset: (query.page - 1) * query.limit, limit: query.limit };
  const sort: ReleaseSort = { column: SORT_COLUMN_MAP[query.sort], order: query.order };

  const [rows, total] = await Promise.all([deps.findMany(filters, pagination, sort), deps.count(filters)]);

  return {
    data: rows.map(toReleaseSummary),
    pagination: buildPaginationMeta(query.page, query.limit, total),
  };
}

export interface GetReleaseDetailDeps {
  findById: (id: string) => ReturnType<typeof releasesRepository.findById>;
  findTransitionsByReleaseId: (releaseId: string) => ReturnType<typeof transitionsRepository.findByReleaseId>;
  countCommentsByReleaseId: (releaseId: string) => ReturnType<typeof commentsRepository.countByReleaseId>;
}

export function createGetReleaseDetailDeps(db: Database): GetReleaseDetailDeps {
  return {
    findById: (id) => releasesRepository.findById(db, id),
    findTransitionsByReleaseId: (releaseId) => transitionsRepository.findByReleaseId(db, releaseId),
    countCommentsByReleaseId: (releaseId) => commentsRepository.countByReleaseId(db, releaseId),
  };
}

export async function getReleaseDetail(deps: GetReleaseDetailDeps, id: string): Promise<ReleaseDetail> {
  const release = await deps.findById(id);
  if (!release) {
    throw new NotFoundError('release', id);
  }

  const [transitionRows, commentCount] = await Promise.all([
    deps.findTransitionsByReleaseId(id),
    deps.countCommentsByReleaseId(id),
  ]);

  return {
    ...toReleaseSummary(release),
    transitions: transitionRows.map(toTransition),
    commentCount,
  };
}
