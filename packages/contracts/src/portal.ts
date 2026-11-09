import { z } from 'zod';
import { PaginationQuerySchema } from './common';
import { SHIPMENT_STATUSES } from './enums';
import type { HandlingFeeEstimateDto } from './handling-fee';
import type { WarehouseSummaryDto } from './warehouse';

/**
 * Client portal: people at a business client sign in to see their stock,
 * orders, inbounds, deliveries and statement. Accounts are created by Estene
 * staff; the first password is temporary and must be changed at first sign-in.
 */

export const ClientLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1, 'Enter your password'),
});
export type ClientLoginInput = z.infer<typeof ClientLoginSchema>;

export const PortalChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Include a letter')
    .regex(/\d/, 'Include a number'),
});
export type PortalChangePasswordInput = z.infer<typeof PortalChangePasswordSchema>;

export type ClientUserProfile = {
  id: string;
  name: string;
  email: string;
  /** True until the temporary password from Estene has been replaced. */
  mustChangePassword: boolean;
  client: { id: string; name: string; warehousing: boolean };
};

// ── Admin: managing a client's portal users ─────────────────────────────────

export const PortalUserCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().trim().toLowerCase(),
});
export type PortalUserCreateInput = z.infer<typeof PortalUserCreateSchema>;

export type PortalUserDto = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

/** The temporary password is in this response only — staff pass it on, it is never shown again. */
export type PortalUserCredentialsDto = { user: PortalUserDto; temporaryPassword: string };

// ── Portal views ────────────────────────────────────────────────────────────

export type PortalOverviewDto = {
  /** Null when warehousing is off for this client. */
  warehouse: WarehouseSummaryDto | null;
  shipments: { active: number; deliveredThisMonth: number };
  /** On-account charges and fees not yet paid, kobo. */
  outstanding: number;
  /** Warehousing clients only. */
  handlingFee: {
    current: HandlingFeeEstimateDto | null;
    totalDue: number;
    nextDueAt: string | null;
    overdue: boolean;
  } | null;
};

export const PortalShipmentQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(SHIPMENT_STATUSES).optional(),
});

export const STATEMENT_ENTRY_TYPES = [
  'shipment_charge',
  'storage_fee',
  'handling_fee',
  'fee_waived',
  'payment_received',
] as const;
/** Entries that reduce what the client owes. */
export const STATEMENT_CREDIT_TYPES: readonly StatementEntryType[] = [
  'payment_received',
  'fee_waived',
];
export type StatementEntryType = (typeof STATEMENT_ENTRY_TYPES)[number];

export const STATEMENT_ENTRY_LABELS: Record<StatementEntryType, string> = {
  shipment_charge: 'Delivery charge',
  storage_fee: 'Warehousing fee',
  handling_fee: 'Handling fee',
  fee_waived: 'Handling fee waived',
  payment_received: 'Payment received',
};

export type StatementEntryDto = {
  id: string;
  type: StatementEntryType;
  /** Kobo; always positive — `type` says which way it moves the balance. */
  amount: number;
  reference: string | null;
  note: string | null;
  trackingNumber: string | null;
  at: string;
};
