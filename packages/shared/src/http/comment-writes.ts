import { z } from 'zod';

export const CreateCommentRequestSchema = z.object({
  body: z.string().min(1),
});

export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>;
