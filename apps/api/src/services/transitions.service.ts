import { canTransition, type ReleaseSummary, type SessionUser, type TransitionRequest } from '@quality-lab/shared';
import type { Database, Transaction } from '../db/client.js';
import * as auditLogRepository from '../db/repositories/audit-log.repository.js';
import * as jobQueueRepository from '../db/repositories/job-queue.repository.js';
import * as releasesRepository from '../db/repositories/releases.repository.js';
import * as transitionsRepository from '../db/repositories/transitions.repository.js';
import { NotFoundError } from './errors.js';
import { denialReasonToFailure, type WriteResult } from './write-result.js';

type TransitionOutcome =
  | { kind: 'stale'; currentVersion: number | undefined }
  | { kind: 'ok'; updated: NonNullable<Awaited<ReturnType<typeof releasesRepository.conditionalUpdateStatus>>> };

export interface TransitionReleaseDeps {
  findById: (id: string) => ReturnType<typeof releasesRepository.findById>;
  runInTransaction: (fn: (tx: Transaction) => Promise<TransitionOutcome>) => Promise<TransitionOutcome>;
  enqueueJob: (job: jobQueueRepository.EnqueueJobRow) => Promise<void>;
}

export function createTransitionReleaseDeps(db: Database): TransitionReleaseDeps {
  return {
    findById: (id) => releasesRepository.findById(db, id),
    runInTransaction: (fn) => db.transaction(fn),
    enqueueJob: (job) => jobQueueRepository.enqueue(db, job),
  };
}

export async function transitionRelease(
  deps: TransitionReleaseDeps,
  params: {
    releaseId: string;
    actor: SessionUser | undefined;
    body: TransitionRequest;
    requestId: string;
  },
): Promise<WriteResult<ReleaseSummary>> {
  if (!params.actor) {
    return { ok: false, failure: { kind: 'unauthenticated' } };
  }
  const { actor, body, releaseId, requestId } = params;

  const release = await deps.findById(releaseId);
  if (!release || !release.creator) {
    throw new NotFoundError('release', releaseId);
  }

  const check = canTransition({
    from: release.status,
    to: body.to,
    actorRole: actor.role,
    isCreator: actor.id === release.createdBy,
  });
  if (!check.allowed) {
    return { ok: false, failure: denialReasonToFailure(check.reason) };
  }

  const outcome = await deps.runInTransaction(async (tx) => {
    const updated = await releasesRepository.conditionalUpdateStatus(tx, {
      id: releaseId,
      expectedVersion: body.expectedVersion,
      toStatus: body.to,
    });
    if (!updated) {
      // 0 rows affected - someone else moved this release first. Fetch the
      // current version, in the same tx, for the 409 payload. This is a
      // legitimate return value, not a thrown error: the failed conditional
      // UPDATE made no change, so the transaction commits normally either
      // way - only a genuinely unexpected DB error should trigger a real
      // ROLLBACK.
      const currentVersion = await releasesRepository.findCurrentVersion(tx, releaseId);
      return { kind: 'stale', currentVersion };
    }

    await transitionsRepository.insert(tx, {
      releaseId,
      fromStatus: release.status,
      toStatus: body.to,
      actorId: actor.id,
      reason: body.reason ?? null,
    });
    await auditLogRepository.insert(tx, {
      entityType: 'release',
      entityId: releaseId,
      action: `release.${body.to}`,
      actorId: actor.id,
      payload: { from: release.status, to: body.to, reason: body.reason ?? null },
      requestId,
    });

    return { kind: 'ok', updated };
  });

  if (outcome.kind === 'stale') {
    return {
      ok: false,
      failure: {
        kind: 'conflict',
        code: 'CONFLICT_STALE_VERSION',
        ...(outcome.currentVersion !== undefined ? { currentVersion: outcome.currentVersion } : {}),
      },
    };
  }

  // Deliberately outside the transaction: if this throws after the status
  // change + transitions/audit_log rows already committed, the release is
  // left correctly transitioned but the side effect never fires. Only an
  // outbox (write the enqueue intent in the same transaction, dispatch via
  // a separate poller) closes that window - not implemented here; see
  // docs/adr/0016-side-effects-after-commit.md. Phase 5 owns the real job
  // queue.
  await deps.enqueueJob({ jobType: 'release.transitioned', payload: { releaseId, toStatus: body.to } });

  return {
    ok: true,
    value: {
      id: outcome.updated.id,
      releaseLabel: outcome.updated.releaseLabel,
      title: outcome.updated.title,
      description: outcome.updated.description,
      serviceName: outcome.updated.serviceName,
      status: outcome.updated.status,
      createdAt: outcome.updated.createdAt.toISOString(),
      updatedAt: outcome.updated.updatedAt.toISOString(),
      version: outcome.updated.version,
      creator: release.creator,
    },
  };
}
