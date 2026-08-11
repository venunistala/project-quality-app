import { z } from 'zod';
import { PaginationQuerySchema } from './pagination.js';
import { UserSummarySchema } from './release.js';

export const CommentSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  createdAt: z.string(),
  author: UserSummarySchema,
});

export type Comment = z.infer<typeof CommentSchema>;

export const CommentListQuerySchema = z.object({
  ...PaginationQuerySchema.shape,
});

export type CommentListQuery = z.infer<typeof CommentListQuerySchema>;
