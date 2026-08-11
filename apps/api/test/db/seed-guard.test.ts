import { afterEach, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db/client.js';
import { runSeed } from '../../src/db/seed/run-seed.js';

describe('runSeed - production guard', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('refuses to seed when NODE_ENV=production, before ever touching the db', async () => {
    process.env.NODE_ENV = 'production';
    // Never dereferenced - the guard must throw before any db call is made.
    const fakeDb = {} as Database;

    await expect(runSeed(fakeDb)).rejects.toThrow(/production/i);
  });
});
