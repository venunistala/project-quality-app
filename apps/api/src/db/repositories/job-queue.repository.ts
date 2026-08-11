import type { Database } from '../client.js';
import { jobQueue } from '../schema/index.js';

export interface EnqueueJobRow {
  jobType: string;
  payload: Record<string, unknown>;
}

export async function enqueue(db: Database, row: EnqueueJobRow): Promise<void> {
  await db.insert(jobQueue).values(row);
}
