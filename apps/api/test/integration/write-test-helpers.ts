import { randomUUID } from 'node:crypto';
import type { UserRole } from '@quality-lab/shared';
import { SEED_USER_PASSWORD } from '../../src/db/seed/fixtures.js';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { releases } from '../../src/db/schema/index.js';
import type { TestApp } from './test-app.js';

export interface LoggedInUser {
  cookieValue: string;
  id: string;
  name: string;
  role: UserRole;
  email: string;
}

/** Logs in as a seeded user (all seeded users share SEED_USER_PASSWORD) and returns the session cookie value. */
export async function loginAs(testApp: TestApp, email: string): Promise<LoggedInUser> {
  const response = await testApp.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: SEED_USER_PASSWORD },
  });
  if (response.statusCode !== 200) {
    throw new Error(`login failed for ${email}: ${response.statusCode} ${response.body}`);
  }
  const cookie = response.cookies.find((c) => c.name === 'session');
  if (!cookie) {
    throw new Error('login response did not set a session cookie');
  }
  const body = response.json() as { id: string; name: string; role: UserRole; email: string };
  return { cookieValue: cookie.value, ...body };
}

export interface SeedUserRef {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

// buildUsers() always sets an explicit id/email; InferInsertModel only
// marks `id` optional because the column has a DB-side default - narrowing
// it here means every call site gets a plain `string`, not `string | undefined`.
export function fixtureUserOfRole(fixture: Fixture, role: UserRole, excludeId?: string): SeedUserRef {
  const user = fixture.users.find((u) => u.role === role && u.id !== excludeId);
  if (!user || !user.id) {
    throw new Error(`expected a seeded ${role} user${excludeId ? ` other than ${excludeId}` : ''}`);
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Inserts a fresh draft release directly (bypassing the API), for tests that need a known starting state. */
export async function insertDraftRelease(testApp: TestApp, createdBy: string) {
  const [release] = await testApp.db
    .insert(releases)
    .values({ releaseLabel: `write-test-${randomUUID()}`, title: 'Write test release', serviceName: 'svc', createdBy })
    .returning();
  if (!release) {
    throw new Error('insert did not return a row');
  }
  return release;
}
