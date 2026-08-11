import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { applyMigrations } from '../../src/db/apply-migrations.js';
import { createDbClient } from '../../src/db/client.js';

/**
 * Runs once before the whole integration suite: drop/recreate the public
 * schema and apply migrations, mirroring what `db:reset && db:migrate` does
 * locally and what the CI integration job does before running these tests.
 */
export default async function setup(): Promise<void> {
  loadDotenv({ path: resolve(process.cwd(), '../../.env') });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run integration tests');
  }

  const { client, db } = createDbClient(databaseUrl, { max: 1 });
  await client`drop schema public cascade`;
  await client`create schema public`;
  await applyMigrations(db);
  await client.end();
}
