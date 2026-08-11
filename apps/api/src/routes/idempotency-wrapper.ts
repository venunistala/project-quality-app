import type { FastifyRequest } from 'fastify';
import { createIdempotencyDeps, claimIdempotency, completeIdempotency, abandonIdempotency } from '../services/idempotency.service.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';

export interface RouteResponse {
  statusCode: number;
  body: unknown;
}

function envelope(code: string, message: string, requestId: string): RouteResponse {
  return { statusCode: code === 'IDEMPOTENCY_KEY_REUSED' ? 422 : 409, body: { error: { code, message, requestId } } };
}

/**
 * Wraps a write handler with Idempotency-Key semantics when the header is
 * present; runs the handler directly (no DB round trip) when it isn't. Only
 * clean WriteResult outcomes (2xx and 4xx envelopes returned by `run`) get
 * cached - if `run` throws (404, infra error), the claim is abandoned so a
 * retry with the same key isn't permanently poisoned by a transient failure.
 */
export async function withIdempotency(
  request: FastifyRequest,
  userId: string,
  run: () => Promise<RouteResponse>,
): Promise<RouteResponse> {
  const key = request.headers[IDEMPOTENCY_HEADER];
  if (typeof key !== 'string' || key.length === 0) {
    return run();
  }

  const deps = createIdempotencyDeps(request.server.db);
  const claimKey = { key, userId, method: request.method, requestPath: request.url };
  const outcome = await claimIdempotency(deps, claimKey, request.body);

  if (outcome.kind === 'mismatch') {
    return envelope('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request body.', request.id);
  }
  if (outcome.kind === 'in-progress') {
    return envelope('IDEMPOTENCY_KEY_IN_PROGRESS', 'A request with this Idempotency-Key is already being processed.', request.id);
  }
  if (outcome.kind === 'replay') {
    return { statusCode: outcome.statusCode, body: outcome.body };
  }

  try {
    const result = await run();
    await completeIdempotency(deps, outcome.claimId, result.statusCode, result.body);
    return result;
  } catch (err) {
    await abandonIdempotency(deps, outcome.claimId);
    throw err;
  }
}
