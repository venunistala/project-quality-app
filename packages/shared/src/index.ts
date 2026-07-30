import { z } from 'zod';

export const ReleaseStatus = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ReleaseStatus = (typeof ReleaseStatus)[keyof typeof ReleaseStatus];

export const ReleaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['draft', 'in_review', 'approved', 'rejected']),
  createdAt: z.string(),
});

export type Release = z.infer<typeof ReleaseSchema>;
