import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { credentials } from '../schema/index.js';

export async function insert(
  db: Database,
  row: { userId: string; passwordHash: string },
): Promise<void> {
  await db.insert(credentials).values(row);
}

export async function findByUserId(db: Database, userId: string) {
  const [row] = await db.select().from(credentials).where(eq(credentials.userId, userId));
  return row;
}
