import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { comments } from '../schema/index.js';
import type { OffsetPagination } from './releases.repository.js';

const AUTHOR_COLUMNS = { id: true, name: true, role: true } as const;

export async function findByReleaseId(db: Database, releaseId: string, pagination: OffsetPagination) {
  return db.query.comments.findMany({
    where: eq(comments.releaseId, releaseId),
    with: { author: { columns: AUTHOR_COLUMNS } },
    orderBy: desc(comments.createdAt),
    limit: pagination.limit,
    offset: pagination.offset,
  });
}

export async function countByReleaseId(db: Database, releaseId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(comments)
    .where(eq(comments.releaseId, releaseId));
  return row?.value ?? 0;
}
