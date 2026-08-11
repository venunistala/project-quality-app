import type { ReleaseStatus } from '@quality-lab/shared';
import { and, asc, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client.js';
import { releases } from '../schema/index.js';
import { escapeLikePattern } from './escape-like-pattern.js';

const CREATOR_COLUMNS = { id: true, name: true, role: true } as const;

export interface ReleaseFilters {
  status?: ReleaseStatus[];
  service?: string;
  q?: string;
  createdBy?: string;
}

export interface OffsetPagination {
  offset: number;
  limit: number;
}

export type ReleaseSortColumn = 'createdAt' | 'updatedAt' | 'releaseLabel';

export interface ReleaseSort {
  column: ReleaseSortColumn;
  order: 'asc' | 'desc';
}

const SORT_COLUMNS = {
  createdAt: releases.createdAt,
  updatedAt: releases.updatedAt,
  releaseLabel: releases.releaseLabel,
} as const;

function buildWhere(filters: ReleaseFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(releases.status, filters.status));
  }
  if (filters.service) {
    conditions.push(eq(releases.serviceName, filters.service));
  }
  if (filters.q) {
    conditions.push(ilike(releases.title, `${escapeLikePattern(filters.q)}%`));
  }
  if (filters.createdBy) {
    conditions.push(eq(releases.createdBy, filters.createdBy));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildOrderBy(sort: ReleaseSort) {
  const column = SORT_COLUMNS[sort.column];
  const direction = sort.order === 'asc' ? asc : desc;
  // releases.id is always appended as a tiebreaker so pagination stays
  // deterministic across pages when the sort column has duplicate values
  // (e.g. the seeded same-createdAt pair, or every row's version tying).
  return [direction(column), asc(releases.id)];
}

export async function findMany(
  db: Database,
  filters: ReleaseFilters,
  pagination: OffsetPagination,
  sort: ReleaseSort,
) {
  return db.query.releases.findMany({
    where: buildWhere(filters),
    with: { creator: { columns: CREATOR_COLUMNS } },
    orderBy: buildOrderBy(sort),
    limit: pagination.limit,
    offset: pagination.offset,
  });
}

export async function count(db: Database, filters: ReleaseFilters): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(releases)
    .where(buildWhere(filters));
  return row?.value ?? 0;
}

export async function findById(db: Database, id: string) {
  return db.query.releases.findFirst({
    where: eq(releases.id, id),
    with: { creator: { columns: CREATOR_COLUMNS } },
  });
}

export async function existsById(db: Database, id: string): Promise<boolean> {
  const [row] = await db.select({ id: releases.id }).from(releases).where(eq(releases.id, id)).limit(1);
  return row !== undefined;
}

export interface InsertReleaseRow {
  releaseLabel: string;
  title: string;
  description: string | null;
  serviceName: string;
  createdBy: string;
}

export async function insert(db: Database, row: InsertReleaseRow) {
  const [inserted] = await db.insert(releases).values(row).returning();
  if (!inserted) {
    throw new Error('insert into releases returned no row');
  }
  return inserted;
}

export async function findCurrentVersion(db: Database, id: string): Promise<number | undefined> {
  const [row] = await db.select({ version: releases.version }).from(releases).where(eq(releases.id, id));
  return row?.version;
}

export interface ConditionalStatusUpdate {
  id: string;
  expectedVersion: number;
  toStatus: ReleaseStatus;
}

/**
 * `WHERE id = ? AND version = ?` with `SET version = version + 1` - the
 * optimistic-lock check and the mutation are the same statement, so there's
 * no window between "check" and "write" for another transaction to land in.
 * Zero rows returned means the version didn't match (stale) - see
 * docs/adr/0013-optimistic-locking.md.
 */
export async function conditionalUpdateStatus(db: Database, params: ConditionalStatusUpdate) {
  const [row] = await db
    .update(releases)
    .set({ status: params.toStatus, version: sql`${releases.version} + 1`, updatedAt: new Date() })
    .where(and(eq(releases.id, params.id), eq(releases.version, params.expectedVersion)))
    .returning();
  return row;
}

export interface ConditionalPatchUpdate {
  id: string;
  expectedVersion: number;
  title?: string;
  description?: string | null;
  serviceName?: string;
}

/** Same conditional-update shape as conditionalUpdateStatus, over the draft-editable fields instead of status. */
export async function conditionalUpdatePatchFields(db: Database, params: ConditionalPatchUpdate) {
  const { id, expectedVersion, title, description, serviceName } = params;
  const [row] = await db
    .update(releases)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(serviceName !== undefined ? { serviceName } : {}),
      version: sql`${releases.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(releases.id, id), eq(releases.version, expectedVersion)))
    .returning();
  return row;
}
