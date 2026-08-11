import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/services/errors.js';
import { getUser, type GetUserDeps } from '../../src/services/users.service.js';

describe('getUser', () => {
  it('throws NotFoundError when the repository returns undefined', async () => {
    const deps: GetUserDeps = { findById: vi.fn().mockResolvedValue(undefined) };

    await expect(getUser(deps, 'missing-id')).rejects.toThrow(NotFoundError);
    await expect(getUser(deps, 'missing-id')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('returns the user as-is when found, with no email field present', async () => {
    const user = { id: 'user-1', name: 'Ava Chen', role: 'engineer' as const };
    const deps: GetUserDeps = { findById: vi.fn().mockResolvedValue(user) };

    const result = await getUser(deps, 'user-1');

    expect(result).toEqual(user);
    expect(Object.keys(result)).not.toContain('email');
  });
});
