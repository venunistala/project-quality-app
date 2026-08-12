import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { auditLog, transitions } from '../../src/db/schema/index.js';
import { openTestApp, type TestApp } from './test-app.js';
import { fixtureUserOfRole, loginAs } from './write-test-helpers.js';

describe('POST /releases', () => {
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

  it('happy path: creates a draft release, writes the initial transition + audit_log rows, returns version 1', async () => {
    const engineer = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, engineer.email);

    const releaseLabel = `svc@v-${randomUUID()}`;
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/releases',
      cookies: { session: session.cookieValue },
      headers: { 'x-request-id': 'req-create-1' },
      payload: { releaseLabel, title: 'New release', description: 'desc', serviceName: 'svc' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      releaseLabel,
      title: 'New release',
      status: 'draft',
      version: 1,
      creator: { id: engineer.id, name: engineer.name, role: engineer.role },
    });
    expect(body.creator.email).toBeUndefined();

    const [transitionRow] = await testApp.db
      .select()
      .from(transitions)
      .where(and(eq(transitions.releaseId, body.id), eq(transitions.toStatus, 'draft')));
    expect(transitionRow).toMatchObject({ fromStatus: null, toStatus: 'draft', actorId: engineer.id });

    const [auditRow] = await testApp.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, body.id), eq(auditLog.action, 'release.created')));
    expect(auditRow).toMatchObject({ actorId: engineer.id, requestId: 'req-create-1' });
  });

  it('401: rejects an unauthenticated request', async () => {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/releases',
      payload: { releaseLabel: `svc@v-${randomUUID()}`, title: 'x', serviceName: 'svc' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('400: rejects a body missing required fields', async () => {
    const engineer = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, engineer.email);

    const response = await testApp.app.inject({
      method: 'POST',
      url: '/releases',
      cookies: { session: session.cookieValue },
      payload: { title: 'missing releaseLabel and serviceName' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
