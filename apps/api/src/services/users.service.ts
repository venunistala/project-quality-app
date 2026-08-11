import type { UserDetail } from '@quality-lab/shared';
import type { Database } from '../db/client.js';
import * as usersRepository from '../db/repositories/users.repository.js';
import { NotFoundError } from './errors.js';

export interface GetUserDeps {
  findById: (id: string) => ReturnType<typeof usersRepository.findById>;
}

export function createGetUserDeps(db: Database): GetUserDeps {
  return {
    findById: (id) => usersRepository.findById(db, id),
  };
}

export async function getUser(deps: GetUserDeps, id: string): Promise<UserDetail> {
  const user = await deps.findById(id);
  if (!user) {
    throw new NotFoundError('user', id);
  }
  return user;
}
