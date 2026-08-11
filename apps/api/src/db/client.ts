import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export function createDbClient(databaseUrl: string, options: { max?: number } = {}) {
  const client = postgres(databaseUrl, { max: options.max ?? 10 });
  const db = drizzle(client, { schema });
  return { client, db };
}

export type Database = ReturnType<typeof createDbClient>['db'];
