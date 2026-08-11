import type { WriteResult } from '../services/write-result.js';
import { mapFailureToHttp } from '../services/write-result.js';
import type { RouteResponse } from './idempotency-wrapper.js';

/** Turns a service's WriteResult into the status code + body a route sends. */
export function toRouteResponse<T>(result: WriteResult<T>, successStatus: number, requestId: string): RouteResponse {
  if (result.ok) {
    return { statusCode: successStatus, body: result.value };
  }
  const mapped = mapFailureToHttp(result.failure);
  return {
    statusCode: mapped.statusCode,
    body: { error: { code: mapped.code, message: mapped.message, requestId, ...mapped.extra } },
  };
}
