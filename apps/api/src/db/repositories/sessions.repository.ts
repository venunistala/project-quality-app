import { and, eq, gt } from 'drizzle-orm';
import type { Database } from '../client.js';
import { sessions, users } from '../schema/index.js';

const USER_COLUMNS = { id: users.id, name: users.name, role: users.role, email: users.email } as const;

export async function insert(
  db: Database,
  row: { userId: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(sessions).values(row);
}

export async function findValidByTokenHash(db: Database, tokenHash: string) {
  const [row] = await db
    .select({ id: sessions.id, expiresAt: sessions.expiresAt, user: USER_COLUMNS })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));
  return row;
}

export async function deleteByTokenHash(db: Database, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
