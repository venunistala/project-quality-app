import {
  CommentListQuerySchema,
  CommentSchema,
  CreateCommentRequestSchema,
  CreateReleaseRequestSchema,
  paginated,
  PatchReleaseRequestSchema,
  ReleaseDetailSchema,
  ReleaseIdParamsSchema,
  ReleaseListQuerySchema,
  ReleaseSummarySchema,
  TransitionRequestSchema,
} from '@quality-lab/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireUser } from '../plugins/require-auth.js';
import {
  createComment,
  createCreateCommentDeps,
  createListReleaseCommentsDeps,
  listReleaseComments,
} from '../services/comments.service.js';
import {
  createCreateReleaseDeps,
  createPatchReleaseDeps,
  createRelease,
  patchRelease,
} from '../services/releases-write.service.js';
import {
  createGetReleaseDetailDeps,
  createListReleasesDeps,
  getReleaseDetail,
  listReleases,
} from '../services/releases.service.js';
import { createTransitionReleaseDeps, transitionRelease } from '../services/transitions.service.js';
import { withIdempotency } from './idempotency-wrapper.js';
import { toRouteResponse } from './write-response.js';

export function registerReleaseRoutes(app: FastifyInstance): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/releases',
    {
      schema: {
        querystring: ReleaseListQuerySchema,
        response: { 200: paginated(ReleaseSummarySchema) },
      },
    },
    async (request) => listReleases(createListReleasesDeps(request.server.db), request.query),
  );

  typedApp.get(
    '/releases/:id',
    {
      schema: {
        params: ReleaseIdParamsSchema,
        response: { 200: ReleaseDetailSchema },
      },
    },
    async (request) => getReleaseDetail(createGetReleaseDetailDeps(request.server.db), request.params.id),
  );

  typedApp.get(
    '/releases/:id/comments',
    {
      schema: {
        params: ReleaseIdParamsSchema,
        querystring: CommentListQuerySchema,
        response: { 200: paginated(CommentSchema) },
      },
    },
    async (request) =>
      listReleaseComments(createListReleaseCommentsDeps(request.server.db), request.params.id, request.query),
  );

  // These four write routes deliberately don't declare a `response` schema:
  // each multiplexes a success shape with several distinct WriteResult
  // failure envelopes (401/403/409/400) at status codes only known at
  // request time, which fastify-type-provider-zod's per-route response
  // typing can't express as a single declared shape. The success body still
  // matches the shared Zod schema (ReleaseSummarySchema/CommentSchema) by
  // construction - see toReleaseSummary/toRouteResponse - it's just not
  // enforced by the serializer the way the read routes' 200s are.
  typedApp.post(
    '/releases',
    {
      preHandler: [app.requireAuth],
      schema: { body: CreateReleaseRequestSchema },
    },
    async (request, reply) => {
      const actor = requireUser(request);
      const outcome = await withIdempotency(request, actor.id, async () =>
        toRouteResponse(
          await createRelease(createCreateReleaseDeps(request.server.db), {
            actor,
            body: request.body,
            requestId: request.id,
          }),
          201,
          request.id,
        ),
      );
      return reply.code(outcome.statusCode).send(outcome.body);
    },
  );

  typedApp.patch(
    '/releases/:id',
    {
      preHandler: [app.requireAuth],
      schema: { params: ReleaseIdParamsSchema, body: PatchReleaseRequestSchema },
    },
    async (request, reply) => {
      const actor = requireUser(request);
      const result = await patchRelease(createPatchReleaseDeps(request.server.db), {
        releaseId: request.params.id,
        actor,
        body: request.body,
      });
      const outcome = toRouteResponse(result, 200, request.id);
      return reply.code(outcome.statusCode).send(outcome.body);
    },
  );

  typedApp.post(
    '/releases/:id/transitions',
    {
      preHandler: [app.requireAuth],
      schema: { params: ReleaseIdParamsSchema, body: TransitionRequestSchema },
    },
    async (request, reply) => {
      const actor = requireUser(request);
      const outcome = await withIdempotency(request, actor.id, async () =>
        toRouteResponse(
          await transitionRelease(createTransitionReleaseDeps(request.server.db), {
            releaseId: request.params.id,
            actor,
            body: request.body,
            requestId: request.id,
          }),
          200,
          request.id,
        ),
      );
      return reply.code(outcome.statusCode).send(outcome.body);
    },
  );

  typedApp.post(
    '/releases/:id/comments',
    {
      preHandler: [app.requireAuth],
      schema: { params: ReleaseIdParamsSchema, body: CreateCommentRequestSchema },
    },
    async (request, reply) => {
      const actor = requireUser(request);
      const result = await createComment(createCreateCommentDeps(request.server.db), {
        releaseId: request.params.id,
        actor,
        body: request.body,
      });
      const outcome = toRouteResponse(result, 201, request.id);
      return reply.code(outcome.statusCode).send(outcome.body);
    },
  );
}
