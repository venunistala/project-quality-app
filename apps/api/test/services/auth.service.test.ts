import { describe, expect, it, vi } from 'vitest';
import { login, logout, type LoginDeps, type LogoutDeps } from '../../src/services/auth.service.js';
import { InvalidCredentialsError } from '../../src/services/errors.js';
import { hashPassword } from '../../src/security/password.js';

describe('login', () => {
  it('returns a token/expiry/user on a correct password', async () => {
    const passwordHash = await hashPassword('correct-horse-battery-staple');
    const insertSession = vi.fn().mockResolvedValue(undefined);
    const deps: LoginDeps = {
      findUserByEmail: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'engineer1@quality-lab.dev',
        name: 'Ava Chen',
        role: 'engineer',
        passwordHash,
      }),
      insertSession,
    };

    const result = await login(deps, { email: 'engineer1@quality-lab.dev', password: 'correct-horse-battery-staple' });

    expect(result.user).toEqual({ id: 'user-1', name: 'Ava Chen', role: 'engineer', email: 'engineer1@quality-lab.dev' });
    expect(result.token).toMatch(/^[\w-]+$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(insertSession).toHaveBeenCalledTimes(1);
    const call = insertSession.mock.calls[0]?.[0] as { userId: string; tokenHash: string; expiresAt: Date };
    expect(call.userId).toBe('user-1');
    expect(call.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex, not the raw token
    expect(call.tokenHash).not.toBe(result.token);
  });

  it('throws InvalidCredentialsError on a wrong password', async () => {
    const passwordHash = await hashPassword('the-real-password');
    const deps: LoginDeps = {
      findUserByEmail: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'engineer1@quality-lab.dev',
        name: 'Ava Chen',
        role: 'engineer',
        passwordHash,
      }),
      insertSession: vi.fn(),
    };

    await expect(login(deps, { email: 'engineer1@quality-lab.dev', password: 'wrong-password' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('throws the identical InvalidCredentialsError on an unknown email - never reveals which failed', async () => {
    const deps: LoginDeps = {
      findUserByEmail: vi.fn().mockResolvedValue(undefined),
      insertSession: vi.fn(),
    };

    await expect(login(deps, { email: 'nobody@quality-lab.dev', password: 'anything' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });
});

describe('logout', () => {
  it('deletes the session by the hashed token when a cookie was present', async () => {
    const deleteSessionByTokenHash = vi.fn().mockResolvedValue(undefined);
    const deps: LogoutDeps = { deleteSessionByTokenHash };

    await logout(deps, 'some-raw-token');

    expect(deleteSessionByTokenHash).toHaveBeenCalledTimes(1);
    const [hash] = deleteSessionByTokenHash.mock.calls[0] as [string];
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe('some-raw-token');
  });

  it('is a no-op when no cookie was present - idempotent logout', async () => {
    const deleteSessionByTokenHash = vi.fn();
    const deps: LogoutDeps = { deleteSessionByTokenHash };

    await logout(deps, undefined);

    expect(deleteSessionByTokenHash).not.toHaveBeenCalled();
  });
});
