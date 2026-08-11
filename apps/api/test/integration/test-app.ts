import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { Config } from '../../src/config.js';
import type { Database } from '../../src/db/client.js';
import { openTestDb } from './test-db.js';

export const testConfig: Config = {
  NODE_ENV: 'test',
  PORT: 0,
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://quality_lab:quality_lab@localhost:5432/quality_lab_test',
};

export interface QueryCounter {
  readonly count: number;
  debug: () => void;
  reset: () => void;
}

export function createQueryCounter(): QueryCounter {
  let count = 0;
  return {
    get count() {
      return count;
    },
    debug: () => {
      count += 1;
    },
    reset: () => {
      count = 0;
    },
  };
}

export interface TestApp {
  app: FastifyInstance;
  client: ReturnType<typeof openTestDb>['client'];
  db: Database;
  queryCounter: QueryCounter;
}

/**
 * Builds a real app backed by a real Postgres connection, with a query
 * counter wired through the postgres driver's debug hook - used by the
 * bounded-query-count assertions (no N+1).
 */
export async function openTestApp(): Promise<TestApp> {
  const queryCounter = createQueryCounter();
  const { client, db } = openTestDb({ debug: queryCounter.debug });
  const app = await buildApp({ config: testConfig, db });
  return { app, client, db, queryCounter };
}
