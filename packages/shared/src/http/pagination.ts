import { z } from 'zod';

const LIMIT_MIN = 1;
const LIMIT_MAX = 100;
const LIMIT_DEFAULT = 20;

/**
 * `page` rejects out-of-range values (>=1); `limit` clamps instead of
 * rejecting, per docs/adr/0007-pagination-limit-clamp.md. A non-numeric
 * `limit` (e.g. "abc") still fails type coercion and rejects - only range
 * violations are clamped.
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .default(LIMIT_DEFAULT)
    .transform((value) => Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, value))),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export function paginated<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: z.array(dataSchema),
    pagination: PaginationMetaSchema,
  });
}
