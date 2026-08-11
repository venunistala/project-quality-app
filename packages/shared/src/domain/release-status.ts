import { z } from 'zod';

export const RELEASE_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'deployed',
  'rolled_back',
] as const;

export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const ReleaseStatusSchema = z.enum(RELEASE_STATUSES);
