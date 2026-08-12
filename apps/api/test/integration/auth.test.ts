import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_USER_PASSWORD } from '../../src/db/seed/fixtures.js';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { credentials } from '../../src/db/schema/index.js';
import { openTestApp, type TestApp } from './test-app.js';

describe('auth', () => {
  let testApp: TestApp;
  let fixture: Fixture;

  beforeAll(async () => {
    testApp = await openTestApp();
    const seeded = await seedAndGetFixture(testApp.db);
    fixture = seeded.fixture;
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
    await testApp.client.end();
  });

  it('POST /auth/login: succeeds with the seeded dev password and sets an httpOnly session cookie', async () => {
    const user = fixture.users[0];
    if (!user) throw new Error('expected at least one seeded user');

    const response = await testApp.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: SEED_USER_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({ id: user.id, name: user.name, role: user.role, email: user.email });

    const cookie = response.cookies.find((c) => c.name === 'session');
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
  });

  it('POST /auth/login: wrong password and unknown email produce the identical failure', async () => {
    const user = fixture.users[0];
    if (!user) throw new Error('expected at least one seeded user');

    const wrongPassword = await testApp.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'definitely-not-the-password' },
    });
    const unknownEmail = await testApp.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody-by-this-email@quality-lab.dev', password: SEED_USER_PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(unknownEmail.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(wrongPassword.json().error.message).toBe(unknownEmail.json().error.message);
  });

  it('GET /auth/me: 401 without a session cookie', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: '/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('GET /auth/me: returns the current user (including email) with a valid session', async () => {
    const user = fixture.users[1];
    if (!user) throw new Error('expected a second seeded user');

    const login = await testApp.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: SEED_USER_PASSWORD },
    });
    const cookie = login.cookies.find((c) => c.name === 'session');
    if (!cookie) throw new Error('login did not set a session cookie');

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { session: cookie.value },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: user.id, name: user.name, role: user.role, email: user.email });
  });

  it('POST /auth/logout: invalidates the session - a subsequent /auth/me with the same cookie is 401', async () => {
    const user = fixture.users[2];
    if (!user) throw new Error('expected a third seeded user');

    const login = await testApp.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: SEED_USER_PASSWORD },
    });
    const cookie = login.cookies.find((c) => c.name === 'session');
    if (!cookie) throw new Error('login did not set a session cookie');

    const logout = await testApp.app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { session: cookie.value },
    });
    expect(logout.statusCode).toBe(200);

    const meAfterLogout = await testApp.app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { session: cookie.value },
    });
    expect(meAfterLogout.statusCode).toBe(401);
  });

  it('POST /auth/logout: is idempotent - 200 even with no session cookie at all', async () => {
    const response = await testApp.app.inject({ method: 'POST', url: '/auth/logout' });
    expect(response.statusCode).toBe(200);
  });

  it('password hashes never appear in the login or /auth/me response bodies', async () => {
    const user = fixture.users[3];
    if (!user?.id) throw new Error('expected a fourth seeded user');

    const [credentialRow] = await testApp.db.select().from(credentials).where(eq(credentials.userId, user.id));
    if (!credentialRow) throw new Error('expected a credentials row for the seeded user');

    const login = await testApp.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: SEED_USER_PASSWORD },
    });
    expect(login.body).not.toContain(credentialRow.passwordHash);

    const cookie = login.cookies.find((c) => c.name === 'session');
    if (!cookie) throw new Error('login did not set a session cookie');
    const me = await testApp.app.inject({ method: 'GET', url: '/auth/me', cookies: { session: cookie.value } });
    expect(me.body).not.toContain(credentialRow.passwordHash);
  });
});
