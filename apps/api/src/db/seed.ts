import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createDbClient } from './client.js';
import { runSeed } from './seed/run-seed.js';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const { client, db } = createDbClient(databaseUrl, { max: 1 });
const summary = await runSeed(db);
await client.end();
console.log('seed complete:', summary);
