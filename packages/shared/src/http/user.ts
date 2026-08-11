import { z } from 'zod';
import { UserSummarySchema } from './release.js';

// Kept as its own export (rather than callers reusing UserSummarySchema
// directly) so GET /users/:id's response shape can diverge from the
// embedded release-creator/transition-actor summary later without a
// breaking rename.
export const UserDetailSchema = UserSummarySchema;

export type UserDetail = z.infer<typeof UserDetailSchema>;

export const UserIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type UserIdParams = z.infer<typeof UserIdParamsSchema>;
