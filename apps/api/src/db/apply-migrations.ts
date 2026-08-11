import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './client.js';

const MIGRATIONS_FOLDER = './src/db/migrations';

export async function applyMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
