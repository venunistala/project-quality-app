import { z } from 'zod';
import { ReleaseStatusSchema } from '../domain/release-status.js';
import { UserRoleSchema } from '../domain/user-role.js';
import { PaginationQuerySchema } from './pagination.js';

export const UserSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: UserRoleSchema,
});

export type UserSummary = z.infer<typeof UserSummarySchema>;

const RELEASE_SORT_FIELDS = ['createdAt', 'updatedAt', 'version'] as const;
export const ReleaseSortFieldSchema = z.enum(RELEASE_SORT_FIELDS);
export type ReleaseSortField = z.infer<typeof ReleaseSortFieldSchema>;

const SORT_ORDERS = ['asc', 'desc'] as const;
export const SortOrderSchema = z.enum(SORT_ORDERS);
export type SortOrder = z.infer<typeof SortOrderSchema>;

/**
 * Accepts a single value (`?status=deployed`, a bare string from Fastify's
 * querystring parser) or repeated values (`?status=deployed&status=approved`,
 * an array) and normalizes to an array either way.
 */
const StatusFilterSchema = z
  .union([ReleaseStatusSchema, z.array(ReleaseStatusSchema)])
  .optional()
  .transform((value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]));

export const ReleaseListQuerySchema = z.object({
  status: StatusFilterSchema,
  service: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  createdBy: z.string().uuid().optional(),
  // "version" sorts by release_label (the business identifier), not the
  // literal `version` lock-counter column - see the Phase 2 ADR/plan note.
  // Every seeded row currently ties at version=1, which would make a
  // literal-column sort a no-op.
  sort: ReleaseSortFieldSchema.default('createdAt'),
  order: SortOrderSchema.default('desc'),
  ...PaginationQuerySchema.shape,
});

export type ReleaseListQuery = z.infer<typeof ReleaseListQuerySchema>;

export const ReleaseIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ReleaseIdParams = z.infer<typeof ReleaseIdParamsSchema>;

export const ReleaseSummarySchema = z.object({
  id: z.string().uuid(),
  releaseLabel: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  serviceName: z.string(),
  status: ReleaseStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
  creator: UserSummarySchema,
});

export type ReleaseSummary = z.infer<typeof ReleaseSummarySchema>;

export const TransitionSchema = z.object({
  id: z.string().uuid(),
  fromStatus: ReleaseStatusSchema.nullable(),
  toStatus: ReleaseStatusSchema,
  reason: z.string().nullable(),
  createdAt: z.string(),
  actor: UserSummarySchema,
});

export type Transition = z.infer<typeof TransitionSchema>;

export const ReleaseDetailSchema = ReleaseSummarySchema.extend({
  transitions: z.array(TransitionSchema),
  commentCount: z.number().int(),
});

export type ReleaseDetail = z.infer<typeof ReleaseDetailSchema>;
