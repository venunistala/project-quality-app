import type { FastifyInstance } from 'fastify';
import { getHealthStatus } from '../services/health.service.js';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', async () => getHealthStatus());
}
