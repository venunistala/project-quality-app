import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export function registerDbPlugin(app: FastifyInstance, db: Database): void {
  app.decorate('db', db);
}
