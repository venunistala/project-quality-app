import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Config } from '../src/config.js';

const testConfig: Config = {
  NODE_ENV: 'test',
  PORT: 0,
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://quality_lab:quality_lab@localhost:5432/quality_lab_test',
};

describe('GET /health', () => {
  it('returns status ok with db not-wired', async () => {
    const app = await buildApp({ config: testConfig });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', db: 'not-wired' });

    await app.close();
  });

  it('echoes an inbound x-request-id back as a response header', async () => {
    const app = await buildApp({ config: testConfig });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'test-request-id-123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('test-request-id-123');

    await app.close();
  });

  it('generates and returns an x-request-id when none is sent', async () => {
    const app = await buildApp({ config: testConfig });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(typeof response.headers['x-request-id']).toBe('string');

    await app.close();
  });

  it('returns a consistent error envelope for unknown routes', async () => {
    const app = await buildApp({ config: testConfig });

    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(response.json().error.requestId).toBeDefined();

    await app.close();
  });
});
