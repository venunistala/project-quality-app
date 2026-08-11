import type { SessionUser } from '@quality-lab/shared';
import type { Database } from '../db/client.js';
import * as sessionsRepository from '../db/repositories/sessions.repository.js';
import * as usersRepository from '../db/repositories/users.repository.js';
import { InvalidCredentialsError } from './errors.js';
import { generateSessionToken, hashSessionToken } from '../security/session-token.js';
import { verifyPassword } from '../security/password.js';

// Absolute, not sliding - the simplest correct choice for a phase that's
// deliberately not trying to be interesting about session UX.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface LoginDeps {
  findUserByEmail: (email: string) => ReturnType<typeof usersRepository.findByEmailWithCredential>;
  insertSession: (row: { userId: string; tokenHash: string; expiresAt: Date }) => Promise<void>;
}

export function createLoginDeps(db: Database): LoginDeps {
  return {
    findUserByEmail: (email) => usersRepository.findByEmailWithCredential(db, email),
    insertSession: (row) => sessionsRepository.insert(db, row),
  };
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: SessionUser;
}

export async function login(deps: LoginDeps, params: { email: string; password: string }): Promise<LoginResult> {
  const row = await deps.findUserByEmail(params.email);
  // Unknown email and wrong password throw the identical error - never
  // reveal which one it was.
  if (!row || !(await verifyPassword(row.passwordHash, params.password))) {
    throw new InvalidCredentialsError();
  }

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await deps.insertSession({ userId: row.id, tokenHash: hashSessionToken(token), expiresAt });

  return {
    token,
    expiresAt,
    user: { id: row.id, name: row.name, role: row.role, email: row.email },
  };
}

export interface LogoutDeps {
  deleteSessionByTokenHash: (tokenHash: string) => Promise<void>;
}

export function createLogoutDeps(db: Database): LogoutDeps {
  return { deleteSessionByTokenHash: (tokenHash) => sessionsRepository.deleteByTokenHash(db, tokenHash) };
}

// Idempotent by design - logging out with a missing or already-invalid
// cookie still "succeeds" (there's simply nothing to delete).
export async function logout(deps: LogoutDeps, rawToken: string | undefined): Promise<void> {
  if (!rawToken) {
    return;
  }
  await deps.deleteSessionByTokenHash(hashSessionToken(rawToken));
}
