import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { registerDbPlugin } from './plugins/db.js';
import { registerErrorHandling } from './plugins/error-handler.js';
import { buildLoggerOptions } from './plugins/logger.js';
import { registerHealthRoute } from './routes/health.js';
import { registerReleaseRoutes } from './routes/releases.routes.js';
import { registerUserRoutes } from './routes/users.routes.js';

export interface BuildAppOptions {
  config: Config;
  // Optional so DB-free unit tests (health checks, 404 envelope, etc.) can
  // build an app with no live Postgres connection at all. Data routes are
  // only registered when a db is supplied.
  db?: Database;
}

export function buildApp({ config, db }: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const inbound = req.headers['x-request-id'];
      return typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();
    },
    logger: buildLoggerOptions(config),
  });

  // Lets routes declare `schema: { querystring: SomeZodSchema, ... }` with
  // the actual shared Zod schemas, so Fastify's own validation lifecycle
  // (not a manual in-handler Schema.parse()) produces 400s - which is also
  // what makes query params visible to the OpenAPI generator later.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // requestIdHeader only controls which INBOUND header Fastify reads a
  // request id from - it does not echo one back as a response header on
  // its own, so that has to be set explicitly here for every response to
  // actually carry the correlation id.
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    // Read-only, seeded/effectively-static data in this phase, but never
    // baking in a positive TTL that would need revisiting the moment writes
    // exist - see docs/adr/0008-no-http-caching.md.
    reply.header('cache-control', 'no-store');
    return payload;
  });

  registerErrorHandling(app, config.NODE_ENV === 'production');
  registerHealthRoute(app);

  if (db) {
    registerDbPlugin(app, db);
    registerReleaseRoutes(app);
    registerUserRoutes(app);
  }

  return app;
}
