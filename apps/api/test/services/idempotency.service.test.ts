import { describe, expect, it, vi } from 'vitest';
import {
  abandonIdempotency,
  claimIdempotency,
  completeIdempotency,
  hashRequestBody,
  type IdempotencyDeps,
} from '../../src/services/idempotency.service.js';

const KEY = { key: 'client-key-1', userId: 'user-1', method: 'POST', requestPath: '/releases' };

function baseDeps(overrides: Partial<IdempotencyDeps> = {}): IdempotencyDeps {
  return {
    deleteIfExpired: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn(),
    findByKey: vi.fn(),
    complete: vi.fn(),
    deleteById: vi.fn(),
    ...overrides,
  };
}

describe('hashRequestBody', () => {
  it('is stable across different key orderings of the same object', () => {
    const a = hashRequestBody({ title: 'x', releaseLabel: 'svc@v1' });
    const b = hashRequestBody({ releaseLabel: 'svc@v1', title: 'x' });
    expect(a).toBe(b);
  });

  it('differs for a different body', () => {
    const a = hashRequestBody({ title: 'x' });
    const b = hashRequestBody({ title: 'y' });
    expect(a).not.toBe(b);
  });
});

describe('claimIdempotency', () => {
  it('always sweeps expired rows for this exact key first', async () => {
    const deleteIfExpired = vi.fn().mockResolvedValue(undefined);
    const deps = baseDeps({ deleteIfExpired, claim: vi.fn().mockResolvedValue('claim-1') });

    await claimIdempotency(deps, KEY, { title: 'x' });

    expect(deleteIfExpired).toHaveBeenCalledWith(KEY);
  });

  it('proceed: the INSERT ... ON CONFLICT wins the claim', async () => {
    const deps = baseDeps({ claim: vi.fn().mockResolvedValue('claim-1') });

    const outcome = await claimIdempotency(deps, KEY, { title: 'x' });

    expect(outcome).toEqual({ kind: 'proceed', claimId: 'claim-1' });
  });

  it('replay: an existing row with a matching hash and a completed response is replayed verbatim', async () => {
    const requestHash = hashRequestBody({ title: 'x' });
    const deps = baseDeps({
      claim: vi.fn().mockResolvedValue(undefined),
      findByKey: vi.fn().mockResolvedValue({ requestHash, responseStatus: 201, responseBody: { id: 'r1' } }),
    });

    const outcome = await claimIdempotency(deps, KEY, { title: 'x' });

    expect(outcome).toEqual({ kind: 'replay', statusCode: 201, body: { id: 'r1' } });
  });

  it('mismatch: an existing row with a different request hash is rejected', async () => {
    const deps = baseDeps({
      claim: vi.fn().mockResolvedValue(undefined),
      findByKey: vi.fn().mockResolvedValue({
        requestHash: hashRequestBody({ title: 'a completely different body' }),
        responseStatus: 201,
        responseBody: {},
      }),
    });

    const outcome = await claimIdempotency(deps, KEY, { title: 'x' });

    expect(outcome).toEqual({ kind: 'mismatch' });
  });

  it('in-progress: an existing row with a matching hash but no response yet is still being written', async () => {
    const requestHash = hashRequestBody({ title: 'x' });
    const deps = baseDeps({
      claim: vi.fn().mockResolvedValue(undefined),
      findByKey: vi.fn().mockResolvedValue({ requestHash, responseStatus: null, responseBody: null }),
    });

    const outcome = await claimIdempotency(deps, KEY, { title: 'x' });

    expect(outcome).toEqual({ kind: 'in-progress' });
  });

  it('retries the claim once if the row vanished between the lost race and the read-back', async () => {
    const claim = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce('claim-2');
    const deps = baseDeps({ claim, findByKey: vi.fn().mockResolvedValue(undefined) });

    const outcome = await claimIdempotency(deps, KEY, { title: 'x' });

    expect(outcome).toEqual({ kind: 'proceed', claimId: 'claim-2' });
    expect(claim).toHaveBeenCalledTimes(2);
  });
});

describe('completeIdempotency / abandonIdempotency', () => {
  it('completeIdempotency stores the final status/body', async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    const deps = baseDeps({ complete });

    await completeIdempotency(deps, 'claim-1', 201, { id: 'r1' });

    expect(complete).toHaveBeenCalledWith('claim-1', { responseStatus: 201, responseBody: { id: 'r1' } });
  });

  it('abandonIdempotency deletes the pending claim row', async () => {
    const deleteById = vi.fn().mockResolvedValue(undefined);
    const deps = baseDeps({ deleteById });

    await abandonIdempotency(deps, 'claim-1');

    expect(deleteById).toHaveBeenCalledWith('claim-1');
  });
});
