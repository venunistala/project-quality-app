import type { ReleaseStatus } from '@quality-lab/shared';
import { asc, eq } from 'drizzle-orm';
import type { Database, Executor } from '../client.js';
import { transitions } from '../schema/index.js';

const ACTOR_COLUMNS = { id: true, name: true, role: true } as const;

export async function findByReleaseId(db: Database, releaseId: string) {
  return db.query.transitions.findMany({
    where: eq(transitions.releaseId, releaseId),
    with: { actor: { columns: ACTOR_COLUMNS } },
    orderBy: asc(transitions.createdAt),
  });
}

export interface InsertTransitionRow {
  releaseId: string;
  fromStatus: ReleaseStatus | null;
  toStatus: ReleaseStatus;
  actorId: string;
  reason: string | null;
}

export async function insert(db: Executor, row: InsertTransitionRow): Promise<void> {
  await db.insert(transitions).values(row);
}
