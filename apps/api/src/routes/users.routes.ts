import { UserDetailSchema, UserIdParamsSchema } from '@quality-lab/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createGetUserDeps, getUser } from '../services/users.service.js';

export function registerUserRoutes(app: FastifyInstance): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/users/:id',
    {
      schema: {
        params: UserIdParamsSchema,
        response: { 200: UserDetailSchema },
      },
    },
    async (request) => getUser(createGetUserDeps(request.server.db), request.params.id),
  );
}
