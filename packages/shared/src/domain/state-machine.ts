import type { ReleaseStatus } from './release-status.js';
import type { UserRole } from './user-role.js';

interface TransitionRule {
  to: ReleaseStatus;
  requiresApproverRole?: true;
  forbidsCreatorActor?: true;
}

/**
 * The legal state machine for a release. Pure data — no DB or HTTP concerns.
 * `submitted -> approved` and `submitted -> rejected` are approver-gated and
 * forbid the creator from acting on their own release (separation of duties).
 * `approved -> deployed` and `deployed -> rolled_back` are intentionally
 * unrestricted: the spec only gates the two submitted edges.
 */
export const TRANSITION_TABLE: Readonly<Record<ReleaseStatus, readonly TransitionRule[]>> = {
  draft: [{ to: 'submitted' }],
  submitted: [
    { to: 'approved', requiresApproverRole: true, forbidsCreatorActor: true },
    { to: 'rejected', requiresApproverRole: true, forbidsCreatorActor: true },
  ],
  approved: [{ to: 'deployed' }],
  rejected: [{ to: 'draft' }],
  deployed: [{ to: 'rolled_back' }],
  rolled_back: [],
};

export interface CanTransitionInput {
  from: ReleaseStatus;
  to: ReleaseStatus;
  actorRole: UserRole;
  isCreator: boolean;
}

export type TransitionDenialReason =
  | 'illegal-transition'
  | 'requires-approver-role'
  | 'creator-cannot-approve-own-release';

export type TransitionResult =
  | { allowed: true }
  | { allowed: false; reason: TransitionDenialReason };

export function canTransition(input: CanTransitionInput): TransitionResult {
  const { from, to, actorRole, isCreator } = input;
  const rule = TRANSITION_TABLE[from].find((candidate) => candidate.to === to);

  if (!rule) {
    return { allowed: false, reason: 'illegal-transition' };
  }
  if (rule.requiresApproverRole && actorRole !== 'approver') {
    return { allowed: false, reason: 'requires-approver-role' };
  }
  if (rule.forbidsCreatorActor && isCreator) {
    return { allowed: false, reason: 'creator-cannot-approve-own-release' };
  }
  return { allowed: true };
}
