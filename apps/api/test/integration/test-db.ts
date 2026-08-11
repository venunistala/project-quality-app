import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createDbClient } from '../../src/db/client.js';

export function openTestDb(): ReturnType<typeof createDbClient> {
  loadDotenv({ path: resolve(process.cwd(), '../../.env') });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run integration tests');
  }

  return createDbClient(databaseUrl, { max: 5 });
}
