import { z } from 'zod';
import type { ActorType, AdminRole } from './enums';
import { NigerianPhoneSchema } from './common';

export const AdminLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;

export const RiderLoginSchema = z.object({
  phone: NigerianPhoneSchema,
  password: z.string().min(6),
});
export type RiderLoginInput = z.infer<typeof RiderLoginSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

/** Claims carried in the access token. Kept small — no PII beyond the id. */
export type TokenClaims = {
  sub: string;
  actor: ActorType;
  role?: AdminRole;
  /** Office agents only: the office they work at. */
  officeId?: string;
  /** Client portal users only: the business they belong to. */
  clientId?: string;
};

export type AuthSession<TUser> = { accessToken: string; user: TUser };

export type AdminProfile = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  office: { id: string; name: string; code: string } | null;
};
