import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createDbClient } from '../../src/db/client.js';

type CreateDbClientOptions = NonNullable<Parameters<typeof createDbClient>[1]>;

export function openTestDb(
  options: Pick<CreateDbClientOptions, 'debug'> = {},
): ReturnType<typeof createDbClient> {
  loadDotenv({ path: resolve(process.cwd(), '../../.env') });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run integration tests');
  }

  return createDbClient(databaseUrl, { max: 5, ...options });
}
