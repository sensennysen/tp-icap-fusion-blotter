import { z } from 'zod';

// MOCK AUTH (bonus TASK-002): no identity provider and no password — the user
// picks a name and a role at login. `trader` may create/amend/cancel trades;
// `viewer` is read-only.
export const roleSchema = z.enum(['trader', 'viewer']);

export type Role = z.infer<typeof roleSchema>;

export const MAX_USERNAME_LENGTH = 64;

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'username is required')
    .max(MAX_USERNAME_LENGTH, 'username is too long'),
  role: roleSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;

export type AuthUser = LoginInput;
