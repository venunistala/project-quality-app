import { describe, expect, it } from 'vitest';
import { canTransition, RELEASE_STATUSES, TRANSITION_TABLE } from '../../src/index.js';

const LEGAL_EDGES = RELEASE_STATUSES.flatMap((from) =>
  TRANSITION_TABLE[from].map((rule) => `${from}->${rule.to}`),
);

describe('canTransition — legal edges', () => {
  it('draft -> submitted is allowed for any role', () => {
    expect(
      canTransition({ from: 'draft', to: 'submitted', actorRole: 'engineer', isCreator: true }),
    ).toEqual({ allowed: true });
  });

  it('submitted -> approved is allowed for a non-creator approver', () => {
    expect(
      canTransition({
        from: 'submitted',
        to: 'approved',
        actorRole: 'approver',
        isCreator: false,
      }),
    ).toEqual({ allowed: true });
  });

  it('submitted -> rejected is allowed for a non-creator approver', () => {
    expect(
      canTransition({
        from: 'submitted',
        to: 'rejected',
        actorRole: 'approver',
        isCreator: false,
      }),
    ).toEqual({ allowed: true });
  });

  it('approved -> deployed is allowed for any role (unrestricted)', () => {
    expect(
      canTransition({ from: 'approved', to: 'deployed', actorRole: 'engineer', isCreator: true }),
    ).toEqual({ allowed: true });
  });

  it('rejected -> draft is allowed for any role', () => {
    expect(
      canTransition({ from: 'rejected', to: 'draft', actorRole: 'engineer', isCreator: true }),
    ).toEqual({ allowed: true });
  });

  it('deployed -> rolled_back is allowed for any role (unrestricted)', () => {
    expect(
      canTransition({
        from: 'deployed',
        to: 'rolled_back',
        actorRole: 'engineer',
        isCreator: true,
      }),
    ).toEqual({ allowed: true });
  });
});

describe('canTransition — illegal edges', () => {
  const allPairs = RELEASE_STATUSES.flatMap((from) =>
    RELEASE_STATUSES.map((to) => [from, to] as const),
  );
  const illegalPairs = allPairs.filter(([from, to]) => !LEGAL_EDGES.includes(`${from}->${to}`));

  it('covers all 30 illegal transitions (36 total pairs minus 6 legal edges)', () => {
    expect(illegalPairs).toHaveLength(30);
  });

  it.each(illegalPairs)('%s -> %s is denied as illegal-transition', (from, to) => {
    const result = canTransition({ from, to, actorRole: 'approver', isCreator: false });
    expect(result).toEqual({ allowed: false, reason: 'illegal-transition' });
  });

  it.each([
    ['draft', 'approved'],
    ['submitted', 'deployed'],
    ['approved', 'rejected'],
    ['rolled_back', 'draft'],
  ] as const)('documents %s -> %s as illegal', (from, to) => {
    const result = canTransition({ from, to, actorRole: 'approver', isCreator: false });
    expect(result).toEqual({ allowed: false, reason: 'illegal-transition' });
  });
});

describe('canTransition — role violations', () => {
  it('engineer cannot approve a submitted release', () => {
    const result = canTransition({
      from: 'submitted',
      to: 'approved',
      actorRole: 'engineer',
      isCreator: false,
    });
    expect(result).toEqual({ allowed: false, reason: 'requires-approver-role' });
  });

  it('engineer cannot reject a submitted release', () => {
    const result = canTransition({
      from: 'submitted',
      to: 'rejected',
      actorRole: 'engineer',
      isCreator: false,
    });
    expect(result).toEqual({ allowed: false, reason: 'requires-approver-role' });
  });

  it('admin cannot approve a submitted release (admin is not an implicit approver)', () => {
    const result = canTransition({
      from: 'submitted',
      to: 'approved',
      actorRole: 'admin',
      isCreator: false,
    });
    expect(result).toEqual({ allowed: false, reason: 'requires-approver-role' });
  });
});

describe('canTransition — separation of duties', () => {
  it('an approver cannot approve their own release', () => {
    const result = canTransition({
      from: 'submitted',
      to: 'approved',
      actorRole: 'approver',
      isCreator: true,
    });
    expect(result).toEqual({ allowed: false, reason: 'creator-cannot-approve-own-release' });
  });

  it('an approver cannot reject their own release', () => {
    const result = canTransition({
      from: 'submitted',
      to: 'rejected',
      actorRole: 'approver',
      isCreator: true,
    });
    expect(result).toEqual({ allowed: false, reason: 'creator-cannot-approve-own-release' });
  });
});

describe('canTransition — terminal states', () => {
  it.each(RELEASE_STATUSES)('deployed -> %s: only rolled_back is legal', (to) => {
    const result = canTransition({ from: 'deployed', to, actorRole: 'admin', isCreator: false });
    if (to === 'rolled_back') {
      expect(result).toEqual({ allowed: true });
    } else {
      expect(result).toEqual({ allowed: false, reason: 'illegal-transition' });
    }
  });

  it.each(RELEASE_STATUSES)('rolled_back -> %s is always denied', (to) => {
    const result = canTransition({
      from: 'rolled_back',
      to,
      actorRole: 'admin',
      isCreator: false,
    });
    expect(result).toEqual({ allowed: false, reason: 'illegal-transition' });
  });
});
