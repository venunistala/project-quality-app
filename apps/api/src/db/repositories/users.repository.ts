import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { users } from '../schema/index.js';

export async function findById(db: Database, id: string) {
  const [row] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, id));
  return row;
}
