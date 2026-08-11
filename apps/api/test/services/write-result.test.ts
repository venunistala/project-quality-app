import { describe, expect, it } from 'vitest';
import { denialReasonToFailure, mapFailureToHttp, type WriteFailure } from '../../src/services/write-result.js';

describe('mapFailureToHttp', () => {
  it('unauthenticated -> 401', () => {
    const failure: WriteFailure = { kind: 'unauthenticated' };
    expect(mapFailureToHttp(failure)).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
  });

  it('forbidden -> 403, using the specific forbidden code', () => {
    const failure: WriteFailure = { kind: 'forbidden', code: 'FORBIDDEN_SELF_APPROVAL' };
    expect(mapFailureToHttp(failure)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN_SELF_APPROVAL' });
  });

  it('conflict/illegal-transition -> 409, no currentVersion in the payload', () => {
    const failure: WriteFailure = { kind: 'conflict', code: 'CONFLICT_ILLEGAL_TRANSITION' };
    const mapped = mapFailureToHttp(failure);
    expect(mapped).toMatchObject({ statusCode: 409, code: 'CONFLICT_ILLEGAL_TRANSITION' });
    expect(mapped.extra).toBeUndefined();
  });

  it('conflict/stale-version -> 409, with currentVersion surfaced in the payload', () => {
    const failure: WriteFailure = { kind: 'conflict', code: 'CONFLICT_STALE_VERSION', currentVersion: 4 };
    const mapped = mapFailureToHttp(failure);
    expect(mapped).toMatchObject({ statusCode: 409, code: 'CONFLICT_STALE_VERSION' });
    expect(mapped.extra).toEqual({ currentVersion: 4 });
  });

  it('validation -> 400', () => {
    const failure: WriteFailure = { kind: 'validation', message: 'bad input' };
    expect(mapFailureToHttp(failure)).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'bad input',
    });
  });
});

describe('denialReasonToFailure', () => {
  it('illegal-transition -> conflict/CONFLICT_ILLEGAL_TRANSITION (409)', () => {
    expect(denialReasonToFailure('illegal-transition')).toEqual({
      kind: 'conflict',
      code: 'CONFLICT_ILLEGAL_TRANSITION',
    });
  });

  it('requires-approver-role -> forbidden/FORBIDDEN_ROLE (403)', () => {
    expect(denialReasonToFailure('requires-approver-role')).toEqual({ kind: 'forbidden', code: 'FORBIDDEN_ROLE' });
  });

  it('creator-cannot-approve-own-release -> forbidden/FORBIDDEN_SELF_APPROVAL (403)', () => {
    expect(denialReasonToFailure('creator-cannot-approve-own-release')).toEqual({
      kind: 'forbidden',
      code: 'FORBIDDEN_SELF_APPROVAL',
    });
  });
});
