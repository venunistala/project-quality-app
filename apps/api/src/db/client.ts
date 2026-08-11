import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

type PostgresOptions = NonNullable<Parameters<typeof postgres>[1]>;

export function createDbClient(
  databaseUrl: string,
  options: { max?: number; debug?: PostgresOptions['debug'] } = {},
) {
  const client = postgres(databaseUrl, {
    max: options.max ?? 10,
    ...(options.debug ? { debug: options.debug } : {}),
  });
  const db = drizzle(client, { schema });
  return { client, db };
}

export type Database = ReturnType<typeof createDbClient>['db'];
