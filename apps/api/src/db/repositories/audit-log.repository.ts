import type { Executor } from '../client.js';
import { auditLog } from '../schema/index.js';

export interface InsertAuditLogRow {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  payload: Record<string, unknown>;
  requestId: string | null;
}

export async function insert(db: Executor, row: InsertAuditLogRow): Promise<void> {
  await db.insert(auditLog).values(row);
}
