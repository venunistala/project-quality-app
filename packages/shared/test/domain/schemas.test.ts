import { describe, expect, it } from 'vitest';
import { RELEASE_STATUSES, ReleaseStatusSchema, USER_ROLES, UserRoleSchema } from '../../src/index.js';

describe('ReleaseStatusSchema', () => {
  it.each(RELEASE_STATUSES)('accepts %s', (status) => {
    expect(ReleaseStatusSchema.safeParse(status).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(ReleaseStatusSchema.safeParse('not-a-real-status').success).toBe(false);
  });
});

describe('UserRoleSchema', () => {
  it.each(USER_ROLES)('accepts %s', (role) => {
    expect(UserRoleSchema.safeParse(role).success).toBe(true);
  });

  it('rejects an unknown role', () => {
    expect(UserRoleSchema.safeParse('superuser').success).toBe(false);
  });
});
