import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { createJsonSchemaTransform } from 'fastify-type-provider-zod';

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  // @fastify/swagger must be registered - and awaited - before any routes:
  // it collects schemas via an onRoute hook installed when its plugin body
  // actually runs, which register() only schedules rather than running
  // synchronously. Registering it without awaiting (or after routes) means
  // the hook isn't attached yet when those routes are declared, and the
  // generated spec silently ends up with zero paths.
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'quality-lab API',
        description: 'Read-only HTTP API for the quality-lab release-approval tracker.',
        version: '0.0.0',
      },
    },
    // Generates the spec from the same Zod schemas used for request
    // validation (schema.querystring/params/response) - no separate
    // hand-maintained copy that can drift from what's actually enforced.
    transform: createJsonSchemaTransform({}),
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });
}
