import { canTransition, RELEASE_STATUSES, type ReleaseStatus, type UserRole } from '@quality-lab/shared';
import type { InferInsertModel } from 'drizzle-orm';
import type { auditLog, comments, releases, transitions, users } from '../schema/index.js';
import {
  COMMENT_TEMPLATES,
  REJECTION_REASONS,
  SERVICE_NAMES,
  TITLE_ADJECTIVES,
  TITLE_NOUNS,
  USER_NAMES,
} from './fixtures.js';
import { Rng } from './rng.js';

/** Fixed so the same code produces byte-identical draws on every run. */
export const SEED = 1337;

const RELEASE_COUNT = 200;
const STATUS_WEIGHTS: Record<ReleaseStatus, number> = {
  deployed: 100,
  draft: 40,
  rejected: 20,
  submitted: 15,
  approved: 15,
  rolled_back: 10,
};

// Reserved slots (after the weighted array is shuffled) for the guaranteed
// edge cases the spec asks for - see docs/README seed-data note.
const REJECT_CYCLE_INDEX = 0;
const ZERO_COMMENTS_INDEX = 1;
const LONG_TITLE_INDEX = 2;
const UNICODE_INDEX = 3;
const SAME_TIMESTAMP_INDEX_A = 4;
const SAME_TIMESTAMP_INDEX_B = 5;

type UserInsert = InferInsertModel<typeof users>;
type ReleaseInsert = InferInsertModel<typeof releases>;
type TransitionInsert = InferInsertModel<typeof transitions>;
type CommentInsert = InferInsertModel<typeof comments>;
type AuditLogInsert = InferInsertModel<typeof auditLog>;

export interface Fixture {
  users: UserInsert[];
  releases: ReleaseInsert[];
  transitions: TransitionInsert[];
  comments: CommentInsert[];
  auditLog: AuditLogInsert[];
}

interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function buildUsers(rng: Rng): SeedUser[] {
  const roleAssignments: { prefix: string; count: number; role: UserRole }[] = [
    { prefix: 'engineer', count: 6, role: 'engineer' },
    { prefix: 'approver', count: 4, role: 'approver' },
    { prefix: 'admin', count: 2, role: 'admin' },
  ];

  const result: SeedUser[] = [];
  let nameIndex = 0;
  for (const { prefix, count, role } of roleAssignments) {
    for (let i = 1; i <= count; i++) {
      const name = USER_NAMES[nameIndex];
      if (name === undefined) {
        throw new Error(`seed generated more users (${nameIndex + 1}) than names available`);
      }
      nameIndex++;
      result.push({
        id: rng.uuid(),
        email: `${prefix}${i}@quality-lab.dev`,
        name,
        role,
      });
    }
  }
  return result;
}

function buildCreatorPool(seedUsers: SeedUser[]): SeedUser[] {
  const pool: SeedUser[] = [];
  for (const user of seedUsers) {
    const weight = user.role === 'engineer' ? 3 : user.role === 'approver' ? 2 : 1;
    for (let i = 0; i < weight; i++) {
      pool.push(user);
    }
  }
  return pool;
}

function pickApproverExcluding(rng: Rng, approvers: SeedUser[], excludeId: string): SeedUser {
  const eligible = approvers.filter((approver) => approver.id !== excludeId);
  if (eligible.length === 0) {
    throw new Error('seed needs at least one approver who is not the release creator');
  }
  return rng.pick(eligible);
}

function buildStatusSlots(rng: Rng): ReleaseStatus[] {
  const slots: ReleaseStatus[] = [];
  for (const status of RELEASE_STATUSES) {
    for (let i = 0; i < STATUS_WEIGHTS[status]; i++) {
      slots.push(status);
    }
  }
  if (slots.length !== RELEASE_COUNT) {
    throw new Error(`status weights sum to ${slots.length}, expected ${RELEASE_COUNT}`);
  }
  const shuffled = rng.shuffle(slots);
  // Force slot 0's target status to draft so REJECT_CYCLE_INDEX is legal.
  shuffled[REJECT_CYCLE_INDEX] = 'draft';
  return shuffled;
}

function clampBefore(candidate: Date, before: Date): Date {
  return candidate.getTime() < before.getTime() ? candidate : new Date(before.getTime() - 1000);
}

function stepTimestamp(rng: Rng, previous: Date, now: Date, maxGapDays: number): Date {
  const gapMs = (rng.int(1, maxGapDays) * 24 + rng.int(0, 23)) * 60 * 60 * 1000;
  return clampBefore(new Date(previous.getTime() + gapMs), now);
}

function randomStartTimestamp(rng: Rng, earliest: Date, now: Date, bufferDays: number): Date {
  const latestStart = now.getTime() - bufferDays * DAY_MS;
  const span = Math.max(latestStart - earliest.getTime(), DAY_MS);
  return new Date(earliest.getTime() + Math.floor(rng.float() * span));
}

interface PlannedStep {
  toStatus: ReleaseStatus;
  actorId: string;
  reason?: string;
}

function planStandardChain(
  targetStatus: ReleaseStatus,
  creator: SeedUser,
  approvers: SeedUser[],
  allUsers: SeedUser[],
  rng: Rng,
): PlannedStep[] {
  const steps: PlannedStep[] = [];
  if (targetStatus === 'draft') {
    return steps;
  }

  steps.push({ toStatus: 'submitted', actorId: creator.id });
  if (targetStatus === 'submitted') {
    return steps;
  }

  if (targetStatus === 'rejected') {
    const rejector = pickApproverExcluding(rng, approvers, creator.id);
    steps.push({ toStatus: 'rejected', actorId: rejector.id, reason: rng.pick(REJECTION_REASONS) });
    return steps;
  }

  const approver = pickApproverExcluding(rng, approvers, creator.id);
  steps.push({ toStatus: 'approved', actorId: approver.id });
  if (targetStatus === 'approved') {
    return steps;
  }

  steps.push({ toStatus: 'deployed', actorId: rng.pick(allUsers).id });
  if (targetStatus === 'deployed') {
    return steps;
  }

  steps.push({ toStatus: 'rolled_back', actorId: rng.pick(allUsers).id });
  return steps;
}

/** draft -> submitted -> rejected -> draft, repeated `cycles` times. */
function planRejectCycleChain(creator: SeedUser, approvers: SeedUser[], rng: Rng, cycles: number): PlannedStep[] {
  const steps: PlannedStep[] = [];
  for (let i = 0; i < cycles; i++) {
    steps.push({ toStatus: 'submitted', actorId: creator.id });
    const rejector = pickApproverExcluding(rng, approvers, creator.id);
    steps.push({ toStatus: 'rejected', actorId: rejector.id, reason: rng.pick(REJECTION_REASONS) });
    steps.push({ toStatus: 'draft', actorId: creator.id });
  }
  return steps;
}

function findUser(seedUsers: SeedUser[], id: string): SeedUser {
  const user = seedUsers.find((candidate) => candidate.id === id);
  if (!user) {
    throw new Error(`seed referenced unknown actor id ${id}`);
  }
  return user;
}

interface MaterializedChain {
  transitions: TransitionInsert[];
  auditRows: AuditLogInsert[];
  finalStatus: ReleaseStatus;
  finalTimestamp: Date;
}

function materializeChain(
  releaseId: string,
  creator: SeedUser,
  steps: PlannedStep[],
  seedUsers: SeedUser[],
  rng: Rng,
  startTimestamp: Date,
  now: Date,
  maxGapDays: number,
): MaterializedChain {
  const chainTransitions: TransitionInsert[] = [];
  const auditRows: AuditLogInsert[] = [];

  let previousStatus: ReleaseStatus = 'draft';
  let timestamp = startTimestamp;

  chainTransitions.push({
    id: rng.uuid(),
    releaseId,
    fromStatus: null,
    toStatus: 'draft',
    actorId: creator.id,
    reason: null,
    createdAt: timestamp,
  });
  auditRows.push({
    id: rng.uuid(),
    entityType: 'release',
    entityId: releaseId,
    action: 'release.created',
    actorId: creator.id,
    payload: { from: null, to: 'draft' },
    requestId: null,
    createdAt: timestamp,
  });

  for (const step of steps) {
    timestamp = stepTimestamp(rng, timestamp, now, maxGapDays);
    const actor = findUser(seedUsers, step.actorId);
    const result = canTransition({
      from: previousStatus,
      to: step.toStatus,
      actorRole: actor.role,
      isCreator: actor.id === creator.id,
    });
    if (!result.allowed) {
      throw new Error(
        `seed generated an illegal transition ${previousStatus} -> ${step.toStatus} ` +
          `(actor role=${actor.role}, isCreator=${String(actor.id === creator.id)}): ${result.reason}`,
      );
    }

    chainTransitions.push({
      id: rng.uuid(),
      releaseId,
      fromStatus: previousStatus,
      toStatus: step.toStatus,
      actorId: actor.id,
      reason: step.reason ?? null,
      createdAt: timestamp,
    });
    auditRows.push({
      id: rng.uuid(),
      entityType: 'release',
      entityId: releaseId,
      action: `release.${step.toStatus}`,
      actorId: actor.id,
      payload: { from: previousStatus, to: step.toStatus, reason: step.reason ?? null },
      requestId: null,
      createdAt: timestamp,
    });

    previousStatus = step.toStatus;
  }

  return { transitions: chainTransitions, auditRows, finalStatus: previousStatus, finalTimestamp: timestamp };
}

function randomComments(
  rng: Rng,
  releaseId: string,
  allUsers: SeedUser[],
  windowStart: Date,
  windowEnd: Date,
  count: number,
): CommentInsert[] {
  const end = windowEnd.getTime() > windowStart.getTime() ? windowEnd : new Date(windowStart.getTime() + DAY_MS);
  const result: CommentInsert[] = [];
  for (let i = 0; i < count; i++) {
    const createdAt = new Date(windowStart.getTime() + Math.floor(rng.float() * (end.getTime() - windowStart.getTime())));
    result.push({
      id: rng.uuid(),
      releaseId,
      authorId: rng.pick(allUsers).id,
      body: rng.pick(COMMENT_TEMPLATES),
      createdAt,
    });
  }
  return result;
}

export function buildFixture(): Fixture {
  const rng = new Rng(SEED);
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 183 * DAY_MS);

  const seedUsers = buildUsers(rng);
  const approvers = seedUsers.filter((user) => user.role === 'approver');
  const creatorPool = buildCreatorPool(seedUsers);

  const statuses = buildStatusSlots(rng);

  const versionCounters = new Map<string, { major: number; minor: number }>();
  function nextVersion(serviceName: string): string {
    const current = versionCounters.get(serviceName) ?? { major: 1, minor: 0 };
    const label = `${serviceName}@v${current.major}.${current.minor}.0`;
    const next = current.minor >= 9 ? { major: current.major + 1, minor: 0 } : { major: current.major, minor: current.minor + 1 };
    versionCounters.set(serviceName, next);
    return label;
  }

  const releaseRows: ReleaseInsert[] = [];
  const transitionRows: TransitionInsert[] = [];
  const commentRows: CommentInsert[] = [];
  const auditRows: AuditLogInsert[] = [];

  let sharedCollisionTimestamp: Date | undefined;

  for (let index = 0; index < statuses.length; index++) {
    const targetStatus = statuses[index];
    if (targetStatus === undefined) {
      throw new Error(`missing status slot at index ${index}`);
    }

    const releaseId = rng.uuid();
    const creator = rng.pick(creatorPool);
    const serviceName = rng.pick(SERVICE_NAMES);

    const isRejectCycle = index === REJECT_CYCLE_INDEX;
    const isSameTimestamp = index === SAME_TIMESTAMP_INDEX_A || index === SAME_TIMESTAMP_INDEX_B;

    let startTimestamp: Date;
    if (isSameTimestamp) {
      sharedCollisionTimestamp ??= randomStartTimestamp(rng, sixMonthsAgo, now, 90);
      startTimestamp = sharedCollisionTimestamp;
    } else if (isRejectCycle) {
      startTimestamp = randomStartTimestamp(rng, sixMonthsAgo, now, 130);
    } else {
      startTimestamp = randomStartTimestamp(rng, sixMonthsAgo, now, 60);
    }

    const steps = isRejectCycle
      ? planRejectCycleChain(creator, approvers, rng, 3)
      : planStandardChain(targetStatus, creator, approvers, seedUsers, rng);

    const chain = materializeChain(
      releaseId,
      creator,
      steps,
      seedUsers,
      rng,
      startTimestamp,
      now,
      isRejectCycle ? 5 : 8,
    );

    let title = `${capitalize(rng.pick(TITLE_ADJECTIVES))} ${rng.pick(TITLE_NOUNS)}`;
    if (index === LONG_TITLE_INDEX) {
      title = Array.from({ length: 12 }, () => `${capitalize(rng.pick(TITLE_ADJECTIVES))} ${rng.pick(TITLE_NOUNS)}`).join(
        ' — ',
      );
    } else if (index === UNICODE_INDEX) {
      title = '🚀 リリース: 決済サービス v2 — 部分ロールアウト';
    }

    const description = rng.float() < 0.2 ? null : `${title} for ${serviceName}.`;

    releaseRows.push({
      id: releaseId,
      version: nextVersion(serviceName),
      title,
      description,
      serviceName,
      status: chain.finalStatus,
      createdBy: creator.id,
      createdAt: startTimestamp,
      updatedAt: chain.finalTimestamp,
    });

    transitionRows.push(...chain.transitions);
    auditRows.push(...chain.auditRows);

    const commentCount = index === ZERO_COMMENTS_INDEX ? 0 : rng.int(0, 8);
    commentRows.push(
      ...randomComments(rng, releaseId, seedUsers, startTimestamp, chain.finalTimestamp, commentCount),
    );
  }

  const userRows: UserInsert[] = seedUsers.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: new Date(sixMonthsAgo.getTime() - 30 * DAY_MS + Math.floor(rng.float() * 20 * DAY_MS)),
  }));

  return {
    users: userRows,
    releases: releaseRows,
    transitions: transitionRows,
    comments: commentRows,
    auditLog: auditRows,
  };
}
