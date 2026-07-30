import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

function toEnvelope(opts: { code: string; message: string; requestId: string }): ErrorEnvelope {
  return { error: { code: opts.code, message: opts.message, requestId: opts.requestId } };
}

export function registerErrorHandling(app: FastifyInstance, isProduction: boolean): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).send(
      toEnvelope({
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      }),
    );
  });

  app.setErrorHandler((error: FastifyError | ZodError, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error({ err: error }, 'request failed');

    if (error instanceof ZodError) {
      reply.code(400).send(
        toEnvelope({
          code: 'VALIDATION_ERROR',
          message: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
          requestId: request.id,
        }),
      );
      return;
    }

    const statusCode = error.statusCode ?? 500;
    const isClientError = statusCode >= 400 && statusCode < 500;

    reply.code(statusCode).send(
      toEnvelope({
        code: isClientError ? (error.code ?? 'BAD_REQUEST') : 'INTERNAL_SERVER_ERROR',
        message: isProduction && !isClientError ? 'Internal server error' : error.message,
        requestId: request.id,
      }),
    );
  });
}
