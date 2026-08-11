import { z } from 'zod';

export const USER_ROLES = ['engineer', 'approver', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const UserRoleSchema = z.enum(USER_ROLES);
