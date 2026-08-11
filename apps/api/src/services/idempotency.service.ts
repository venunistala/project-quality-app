import { createHash } from 'node:crypto';
import type { Database } from '../db/client.js';
import type { IdempotencyClaimKey } from '../db/repositories/idempotency.repository.js';
import * as idempotencyRepository from '../db/repositories/idempotency.repository.js';

// 24h, enforced lazily (deleteIfExpired, targeted at this exact key) - this
// repo has no cron/scheduler, so keys for requests that are never retried
// after expiry linger in the table. Known limitation, not solved with new
// infra this phase - see docs/adr/0014-idempotency-vs-optimistic-locking.md.
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

/** Hashed over the already-Zod-validated body, so key order on the wire never matters. */
export function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortKeysDeep(body))).digest('hex');
}

export interface IdempotencyDeps {
  deleteIfExpired: (k: IdempotencyClaimKey) => Promise<void>;
  claim: (k: IdempotencyClaimKey, params: { requestHash: string; expiresAt: Date }) => Promise<string | undefined>;
  findByKey: (k: IdempotencyClaimKey) => ReturnType<typeof idempotencyRepository.findByKey>;
  complete: (id: string, params: { responseStatus: number; responseBody: unknown }) => Promise<void>;
  deleteById: (id: string) => Promise<void>;
}

export function createIdempotencyDeps(db: Database): IdempotencyDeps {
  return {
    deleteIfExpired: (k) => idempotencyRepository.deleteIfExpired(db, k),
    claim: (k, params) => idempotencyRepository.claim(db, k, params),
    findByKey: (k) => idempotencyRepository.findByKey(db, k),
    complete: (id, params) => idempotencyRepository.complete(db, id, params),
    deleteById: (id) => idempotencyRepository.deleteById(db, id),
  };
}

export type IdempotencyOutcome =
  | { kind: 'proceed'; claimId: string }
  | { kind: 'replay'; statusCode: number; body: unknown }
  | { kind: 'in-progress' }
  | { kind: 'mismatch' };

/**
 * Concurrency-safe claim: an INSERT ... ON CONFLICT DO NOTHING is the only
 * thing that decides who "wins" a race between two identical-key requests -
 * whichever one's INSERT actually lands gets `proceed`, and Postgres itself
 * serializes that decision. Everyone else reads back whatever the winner
 * left behind (or is still leaving behind, hence `in-progress`).
 */
export async function claimIdempotency(
  deps: IdempotencyDeps,
  key: IdempotencyClaimKey,
  requestBody: unknown,
): Promise<IdempotencyOutcome> {
  await deps.deleteIfExpired(key);

  const requestHash = hashRequestBody(requestBody);
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

  const claimId = await deps.claim(key, { requestHash, expiresAt });
  if (claimId) {
    return { kind: 'proceed', claimId };
  }

  const existing = await deps.findByKey(key);
  if (!existing) {
    // The row we lost the claim race for was deleted/expired between the
    // two calls above - vanishingly unlikely, but retry once rather than
    // reporting a false conflict.
    const retryClaimId = await deps.claim(key, { requestHash, expiresAt });
    return retryClaimId ? { kind: 'proceed', claimId: retryClaimId } : { kind: 'in-progress' };
  }
  if (existing.requestHash !== requestHash) {
    return { kind: 'mismatch' };
  }
  if (existing.responseStatus === null) {
    return { kind: 'in-progress' };
  }
  return { kind: 'replay', statusCode: existing.responseStatus, body: existing.responseBody };
}

export async function completeIdempotency(
  deps: IdempotencyDeps,
  claimId: string,
  statusCode: number,
  body: unknown,
): Promise<void> {
  await deps.complete(claimId, { responseStatus: statusCode, responseBody: body });
}

// Called when the wrapped write throws (404, infra error) instead of
// returning a clean result - a transient failure must not permanently
// poison a retry with this key.
export async function abandonIdempotency(deps: IdempotencyDeps, claimId: string): Promise<void> {
  await deps.deleteById(claimId);
}
