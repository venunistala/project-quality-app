import { z } from 'zod';
import { ReleaseStatusSchema } from '../domain/release-status.js';

export const CreateReleaseRequestSchema = z.object({
  releaseLabel: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  serviceName: z.string().min(1),
});

export type CreateReleaseRequest = z.infer<typeof CreateReleaseRequestSchema>;

export const PatchReleaseRequestSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).nullable().optional(),
    serviceName: z.string().min(1).optional(),
    expectedVersion: z.number().int().min(1),
  })
  .refine((body) => body.title !== undefined || body.description !== undefined || body.serviceName !== undefined, {
    message: 'At least one of title, description, or serviceName must be provided.',
  });

export type PatchReleaseRequest = z.infer<typeof PatchReleaseRequestSchema>;

export const TransitionRequestSchema = z.object({
  to: ReleaseStatusSchema,
  reason: z.string().min(1).optional(),
  expectedVersion: z.number().int().min(1),
});

export type TransitionRequest = z.infer<typeof TransitionRequestSchema>;
