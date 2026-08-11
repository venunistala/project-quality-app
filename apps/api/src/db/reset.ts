import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { applyMigrations } from './apply-migrations.js';
import { createDbClient } from './client.js';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const { client, db } = createDbClient(databaseUrl, { max: 1 });
await client`drop schema public cascade`;
await client`create schema public`;
await applyMigrations(db);
await client.end();
console.log('database reset and migrated');
