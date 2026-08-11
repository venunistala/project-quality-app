import argon2 from 'argon2';

// OWASP Password Storage Cheat Sheet's current minimum-recommended argon2id
// profile (~19 MiB memory, t=2, p=1). See docs/adr/0010-argon2id-parameters.md.
const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2ID_OPTIONS);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
