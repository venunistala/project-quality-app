import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { registerDbPlugin } from './plugins/db.js';
import { registerErrorHandling } from './plugins/error-handler.js';
import { buildLoggerOptions } from './plugins/logger.js';
import { registerHealthRoute } from './routes/health.js';

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

  registerErrorHandling(app, config.NODE_ENV === 'production');
  registerHealthRoute(app);

  if (db) {
    registerDbPlugin(app, db);
  }

  return app;
}
