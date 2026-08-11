import type { CreateReleaseRequest, PatchReleaseRequest, ReleaseStatus, ReleaseSummary, SessionUser, UserSummary } from '@quality-lab/shared';
import type { Database, Transaction } from '../db/client.js';
import * as auditLogRepository from '../db/repositories/audit-log.repository.js';
import * as releasesRepository from '../db/repositories/releases.repository.js';
import * as transitionsRepository from '../db/repositories/transitions.repository.js';
import { NotFoundError } from './errors.js';
import type { WriteResult } from './write-result.js';

interface ReleaseRowLike {
  id: string;
  releaseLabel: string;
  title: string;
  description: string | null;
  serviceName: string;
  status: ReleaseStatus;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function toReleaseSummary(row: ReleaseRowLike, creator: UserSummary): ReleaseSummary {
  return {
    id: row.id,
    releaseLabel: row.releaseLabel,
    title: row.title,
    description: row.description,
    serviceName: row.serviceName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    creator,
  };
}

export interface CreateReleaseDeps {
  runInTransaction: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;
}

export function createCreateReleaseDeps(db: Database): CreateReleaseDeps {
  return { runInTransaction: (fn) => db.transaction(fn) };
}

export async function createRelease(
  deps: CreateReleaseDeps,
  params: { actor: SessionUser | undefined; body: CreateReleaseRequest; requestId: string },
): Promise<WriteResult<ReleaseSummary>> {
  if (!params.actor) {
    return { ok: false, failure: { kind: 'unauthenticated' } };
  }
  const { actor, body, requestId } = params;

  const value = await deps.runInTransaction(async (tx) => {
    const inserted = await releasesRepository.insert(tx, {
      releaseLabel: body.releaseLabel,
      title: body.title,
      description: body.description ?? null,
      serviceName: body.serviceName,
      createdBy: actor.id,
    });
    await transitionsRepository.insert(tx, {
      releaseId: inserted.id,
      fromStatus: null,
      toStatus: 'draft',
      actorId: actor.id,
      reason: null,
    });
    await auditLogRepository.insert(tx, {
      entityType: 'release',
      entityId: inserted.id,
      action: 'release.created',
      actorId: actor.id,
      payload: { from: null, to: 'draft' },
      requestId,
    });
    return toReleaseSummary(inserted, { id: actor.id, name: actor.name, role: actor.role });
  });

  return { ok: true, value };
}

export interface PatchReleaseDeps {
  findById: (id: string) => ReturnType<typeof releasesRepository.findById>;
  conditionalUpdatePatchFields: (
    params: releasesRepository.ConditionalPatchUpdate,
  ) => ReturnType<typeof releasesRepository.conditionalUpdatePatchFields>;
  findCurrentVersion: (id: string) => ReturnType<typeof releasesRepository.findCurrentVersion>;
}

export function createPatchReleaseDeps(db: Database): PatchReleaseDeps {
  return {
    findById: (id) => releasesRepository.findById(db, id),
    conditionalUpdatePatchFields: (params) => releasesRepository.conditionalUpdatePatchFields(db, params),
    findCurrentVersion: (id) => releasesRepository.findCurrentVersion(db, id),
  };
}

export async function patchRelease(
  deps: PatchReleaseDeps,
  params: { releaseId: string; actor: SessionUser | undefined; body: PatchReleaseRequest },
): Promise<WriteResult<ReleaseSummary>> {
  if (!params.actor) {
    return { ok: false, failure: { kind: 'unauthenticated' } };
  }

  const release = await deps.findById(params.releaseId);
  if (!release || !release.creator) {
    throw new NotFoundError('release', params.releaseId);
  }

  // Mirrors canTransition()'s own ordering: is this even legal from the
  // current state, before who's asking.
  if (release.status !== 'draft') {
    return { ok: false, failure: { kind: 'conflict', code: 'CONFLICT_NOT_DRAFT' } };
  }
  if (release.createdBy !== params.actor.id) {
    return { ok: false, failure: { kind: 'forbidden', code: 'FORBIDDEN_NOT_CREATOR' } };
  }

  const updated = await deps.conditionalUpdatePatchFields({
    id: params.releaseId,
    expectedVersion: params.body.expectedVersion,
    ...(params.body.title !== undefined ? { title: params.body.title } : {}),
    ...(params.body.description !== undefined ? { description: params.body.description } : {}),
    ...(params.body.serviceName !== undefined ? { serviceName: params.body.serviceName } : {}),
  });

  if (!updated) {
    const currentVersion = await deps.findCurrentVersion(params.releaseId);
    return {
      ok: false,
      failure: {
        kind: 'conflict',
        code: 'CONFLICT_STALE_VERSION',
        ...(currentVersion !== undefined ? { currentVersion } : {}),
      },
    };
  }

  return { ok: true, value: toReleaseSummary(updated, release.creator) };
}
