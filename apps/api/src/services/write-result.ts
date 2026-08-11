import type { TransitionDenialReason } from '@quality-lab/shared';

// 404 (release not found) deliberately isn't a WriteFailure variant - it's
// checked before authorization/business-rules even run, exactly like the
// existing read services (`if (!release) throw new NotFoundError(...)`),
// so write services reuse that convention instead of inventing a 6th kind
// for a case outside the Phase 3 spec's 5-case mapping list.
export type WriteFailure =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden'; code: 'FORBIDDEN_ROLE' | 'FORBIDDEN_SELF_APPROVAL' | 'FORBIDDEN_NOT_CREATOR' }
  | {
      kind: 'conflict';
      code: 'CONFLICT_ILLEGAL_TRANSITION' | 'CONFLICT_NOT_DRAFT' | 'CONFLICT_STALE_VERSION';
      currentVersion?: number;
    }
  | { kind: 'validation'; message: string };

export type WriteResult<T> = { ok: true; value: T } | { ok: false; failure: WriteFailure };

export interface HttpFailure {
  statusCode: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
}

const FORBIDDEN_MESSAGES: Record<Extract<WriteFailure, { kind: 'forbidden' }>['code'], string> = {
  FORBIDDEN_ROLE: 'This action requires the approver role.',
  FORBIDDEN_SELF_APPROVAL: 'You cannot approve or reject your own release.',
  FORBIDDEN_NOT_CREATOR: 'Only the release creator can do this.',
};

const CONFLICT_MESSAGES: Record<Extract<WriteFailure, { kind: 'conflict' }>['code'], string> = {
  CONFLICT_ILLEGAL_TRANSITION: 'This transition is not legal from the release’s current status.',
  CONFLICT_NOT_DRAFT: 'This release can only be edited while in draft.',
  CONFLICT_STALE_VERSION: 'The release has changed since you loaded it. Refetch and try again.',
};

export function mapFailureToHttp(failure: WriteFailure): HttpFailure {
  switch (failure.kind) {
    case 'unauthenticated':
      return { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Login required.' };
    case 'forbidden':
      return { statusCode: 403, code: failure.code, message: FORBIDDEN_MESSAGES[failure.code] };
    case 'conflict':
      return {
        statusCode: 409,
        code: failure.code,
        message: CONFLICT_MESSAGES[failure.code],
        ...(failure.code === 'CONFLICT_STALE_VERSION' ? { extra: { currentVersion: failure.currentVersion } } : {}),
      };
    case 'validation':
      return { statusCode: 400, code: 'VALIDATION_ERROR', message: failure.message };
  }
}

/** Maps canTransition()'s three denial reasons onto the WriteFailure shape - see docs/adr/0012-403-vs-409.md. */
export function denialReasonToFailure(reason: TransitionDenialReason): WriteFailure {
  switch (reason) {
    case 'illegal-transition':
      return { kind: 'conflict', code: 'CONFLICT_ILLEGAL_TRANSITION' };
    case 'requires-approver-role':
      return { kind: 'forbidden', code: 'FORBIDDEN_ROLE' };
    case 'creator-cannot-approve-own-release':
      return { kind: 'forbidden', code: 'FORBIDDEN_SELF_APPROVAL' };
  }
}
