import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { loadConfig } from '../config.js';
import { createDbClient } from './client.js';
import { runSeed } from './seed/run-seed.js';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });

const config = loadConfig(process.env);

const { client, db } = createDbClient(config.DATABASE_URL, { max: 1 });
const summary = await runSeed(db);
await client.end();
console.log('seed complete:', summary);
