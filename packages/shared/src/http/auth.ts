import { z } from 'zod';
import { UserSummarySchema } from './release.js';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// Self-only projection returned by GET /auth/me - includes email, unlike
// UserSummarySchema (which is embedded in responses about *other* users -
// a release's creator, a transition's actor - where email is third-party
// PII with no need-to-know for the viewer). You already know your own email.
export const SessionUserSchema = UserSummarySchema.extend({
  email: z.string().email(),
});

export type SessionUser = z.infer<typeof SessionUserSchema>;
