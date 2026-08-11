import { asc, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { transitions } from '../schema/index.js';

const ACTOR_COLUMNS = { id: true, name: true, role: true } as const;

export async function findByReleaseId(db: Database, releaseId: string) {
  return db.query.transitions.findMany({
    where: eq(transitions.releaseId, releaseId),
    with: { actor: { columns: ACTOR_COLUMNS } },
    orderBy: asc(transitions.createdAt),
  });
}
