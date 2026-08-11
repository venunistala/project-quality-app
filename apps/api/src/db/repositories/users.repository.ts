import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { credentials, users } from '../schema/index.js';

export async function findById(db: Database, id: string) {
  const [row] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, id));
  return row;
}

export async function findByEmailWithCredential(db: Database, email: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      passwordHash: credentials.passwordHash,
    })
    .from(users)
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .where(eq(users.email, email));
  return row;
}
