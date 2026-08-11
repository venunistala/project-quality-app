import { and, eq, lt } from 'drizzle-orm';
import type { Database } from '../client.js';
import { idempotencyKeys } from '../schema/index.js';

export interface IdempotencyClaimKey {
  key: string;
  userId: string;
  method: string;
  requestPath: string;
}

function whereKey(k: IdempotencyClaimKey) {
  return and(
    eq(idempotencyKeys.key, k.key),
    eq(idempotencyKeys.userId, k.userId),
    eq(idempotencyKeys.method, k.method),
    eq(idempotencyKeys.requestPath, k.requestPath),
  );
}

/** Targeted lazy-expiry sweep - only rows matching this exact key, not a full-table scan. */
export async function deleteIfExpired(db: Database, k: IdempotencyClaimKey): Promise<void> {
  await db.delete(idempotencyKeys).where(and(whereKey(k), lt(idempotencyKeys.expiresAt, new Date())));
}

/**
 * Attempts to claim the key by inserting a pending (response-less) row.
 * Returns the new row's id if this call won the claim race, or undefined if
 * another request already holds (or completed) this key.
 */
export async function claim(
  db: Database,
  k: IdempotencyClaimKey,
  params: { requestHash: string; expiresAt: Date },
): Promise<string | undefined> {
  const [row] = await db
    .insert(idempotencyKeys)
    .values({ ...k, requestHash: params.requestHash, expiresAt: params.expiresAt })
    .onConflictDoNothing({
      target: [idempotencyKeys.key, idempotencyKeys.userId, idempotencyKeys.method, idempotencyKeys.requestPath],
    })
    .returning({ id: idempotencyKeys.id });
  return row?.id;
}

export async function findByKey(db: Database, k: IdempotencyClaimKey) {
  const [row] = await db.select().from(idempotencyKeys).where(whereKey(k));
  return row;
}

export async function complete(
  db: Database,
  id: string,
  params: { responseStatus: number; responseBody: unknown },
): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({ responseStatus: params.responseStatus, responseBody: params.responseBody, completedAt: new Date() })
    .where(eq(idempotencyKeys.id, id));
}

export async function deleteById(db: Database, id: string): Promise<void> {
  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id));
}
