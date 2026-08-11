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

// The handle Drizzle passes into a `db.transaction(async (tx) => ...)`
// callback - structurally close to Database but missing a couple of
// top-level-only members (e.g. `$client`), so it's its own type rather than
// `Database` itself. Write-service repository calls accept this union so
// the same function works whether it's called directly or from inside a
// transaction.
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;
