import { LoginRequestSchema, SessionUserSchema } from '@quality-lab/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireUser } from '../plugins/require-auth.js';
import { createLoginDeps, createLogoutDeps, login, logout } from '../services/auth.service.js';
import { SESSION_COOKIE_NAME } from '../plugins/cookies.js';

export function registerAuthRoutes(app: FastifyInstance, options: { isProduction: boolean }): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/auth/login',
    {
      schema: {
        body: LoginRequestSchema,
        response: { 200: SessionUserSchema },
      },
    },
    async (request, reply) => {
      const result = await login(createLoginDeps(request.server.db), request.body);
      reply.setCookie(SESSION_COOKIE_NAME, result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: options.isProduction,
        path: '/',
        expires: result.expiresAt,
      });
      return result.user;
    },
  );

  typedApp.post(
    '/auth/logout',
    {
      schema: { response: { 200: z.object({}) } },
    },
    async (request, reply) => {
      await logout(createLogoutDeps(request.server.db), request.cookies[SESSION_COOKIE_NAME]);
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return {};
    },
  );

  typedApp.get(
    '/auth/me',
    {
      preHandler: [app.requireAuth],
      schema: { response: { 200: SessionUserSchema } },
    },
    async (request) => requireUser(request),
  );
}
