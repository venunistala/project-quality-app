import {
  CommentListQuerySchema,
  CommentSchema,
  paginated,
  ReleaseDetailSchema,
  ReleaseIdParamsSchema,
  ReleaseListQuerySchema,
  ReleaseSummarySchema,
} from '@quality-lab/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { listReleaseComments, createListReleaseCommentsDeps } from '../services/comments.service.js';
import {
  createGetReleaseDetailDeps,
  createListReleasesDeps,
  getReleaseDetail,
  listReleases,
} from '../services/releases.service.js';

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
}
