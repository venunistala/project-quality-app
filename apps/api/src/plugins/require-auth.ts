import type { SessionUser } from '@quality-lab/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import * as sessionsRepository from '../db/repositories/sessions.repository.js';
import { SESSION_COOKIE_NAME } from './cookies.js';
import { hashSessionToken } from '../security/session-token.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: SessionUser;
  }
}

// Answers ONLY "is this a valid logged-in user" - it makes no role
// decisions. Authorization (who's allowed to do what) is a service-layer
// concern, because separation-of-duties checks need the release's creator
// from the DB, which middleware can't see. See
// docs/adr/0011-authorization-in-service-layer.md.
export function registerRequireAuthPlugin(app: FastifyInstance, db: Database): void {
  app.decorateRequest('user', undefined);

  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const rawToken = request.cookies[SESSION_COOKIE_NAME];
    const row = rawToken ? await sessionsRepository.findValidByTokenHash(db, hashSessionToken(rawToken)) : undefined;

    if (!row) {
      await reply.code(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Login required.', requestId: request.id },
      });
      return;
    }

    request.user = row.user;
  });
}
