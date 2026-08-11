import cookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';

export const SESSION_COOKIE_NAME = 'session';

// No signing secret: a forged/tampered token simply won't hash to any row
// in `sessions`, so the DB lookup in requireAuth already provides the
// integrity guarantee signing would add - see
// docs/adr/0009-session-based-auth.md.
export async function registerCookiesPlugin(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
}
