import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { buildLoggerOptions } from './plugins/logger.js';
import { registerErrorHandling } from './plugins/error-handler.js';
import { registerHealthRoute } from './routes/health.js';

export interface BuildAppOptions {
  config: Config;
}

export function buildApp({ config }: BuildAppOptions): FastifyInstance {
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

  return app;
}
