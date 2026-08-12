import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fixture } from '../../src/db/seed/build-fixture.js';
import { seedAndGetFixture } from '../../src/db/seed/run-seed.js';
import { releases } from '../../src/db/schema/index.js';
import { openTestApp, type TestApp } from './test-app.js';
import { fixtureUserOfRole, loginAs } from './write-test-helpers.js';

describe('Idempotency-Key on POST /releases', () => {
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

  it('replays the exact same response for a retried request, without a second write', async () => {
    const engineer = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, engineer.email);
    const idempotencyKey = `idem-${randomUUID()}`;
    const releaseLabel = `svc@v-${randomUUID()}`;
    const payload = { releaseLabel, title: 'Idempotent create', serviceName: 'svc' };

    const first = await testApp.app.inject({
      method: 'POST',
      url: '/releases',
      cookies: { session: session.cookieValue },
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });
    const second = await testApp.app.inject({
      method: 'POST',
      url: '/releases',
      cookies: { session: session.cookieValue },
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());

    const matchingReleases = await testApp.db.select().from(releases).where(eq(releases.releaseLabel, releaseLabel));
    expect(matchingReleases).toHaveLength(1);
  });

  it('rejects a reused key with a different body as 422, without writing anything for the second body', async () => {
    const engineer = fixtureUserOfRole(fixture, 'engineer');
    const session = await loginAs(testApp, engineer.email);
    const idempotencyKey = `idem-${randomUUID()}`;
    const firstLabel = `svc@v-${randomUUID()}`;
    const secondLabel = `svc@v-${randomUUID()}`;

    const first = await testApp.app.inject({
      method: 'POST',
      url: '/releases',
      cookies: { session: session.cookieValue },
      headers: { 'idempotency-key': idempotencyKey },
      payload: { releaseLabel: firstLabel, title: 'First body', serviceName: 'svc' },
    });
    expect(first.statusCode).toBe(201);

    const second = await testApp.app.inject({
      method: 'POST',
      url: '/releases',
      cookies: { session: session.cookieValue },
      headers: { 'idempotency-key': idempotencyKey },
      payload: { releaseLabel: secondLabel, title: 'Different body', serviceName: 'svc' },
    });

    expect(second.statusCode).toBe(422);
    expect(second.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });

    const secondLabelRows = await testApp.db.select().from(releases).where(eq(releases.releaseLabel, secondLabel));
    expect(secondLabelRows).toHaveLength(0);
  });
});
