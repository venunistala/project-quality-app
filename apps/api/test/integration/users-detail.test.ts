import { randomUUID } from 'node:crypto';
import { UserDetailSchema } from '@quality-lab/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { openTestApp, type TestApp } from './test-app.js';

describe('GET /users/:id', () => {
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

  it.each(['engineer', 'approver', 'admin'] as const)('returns a %s user with no email present', async (role) => {
    const user = fixture.users.find((u) => u.role === role);
    if (!user) throw new Error(`expected a seeded ${role} user`);

    const response = await testApp.app.inject({ method: 'GET', url: `/users/${user.id}` });
    expect(response.statusCode).toBe(200);

    const body = UserDetailSchema.parse(response.json());
    expect(body).toEqual({ id: user.id, name: user.name, role });
    expect(Object.keys(response.json())).not.toContain('email');
  });

  it('returns 404 with the standard envelope for an unknown but valid UUID', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: `/users/${randomUUID()}` });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(body.error.requestId).toBeDefined();
  });

  it('returns 400, not 500, for a malformed id', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: '/users/not-a-uuid' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('issues exactly 1 query', async () => {
    const user = fixture.users[0];
    if (!user) throw new Error('expected at least one seeded user');

    testApp.queryCounter.reset();
    const response = await testApp.app.inject({ method: 'GET', url: `/users/${user.id}` });
    expect(response.statusCode).toBe(200);
    expect(testApp.queryCounter.count).toBe(1);
  });
});
