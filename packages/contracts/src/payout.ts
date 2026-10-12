import { z } from 'zod';
import { ObjectIdSchema, PaginationQuerySchema } from './common';

export const BankAccountInputSchema = z.object({
  bankCode: z.string().trim().min(3).max(10),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Account numbers are 10 digits'),
});
export type BankAccountInput = z.infer<typeof BankAccountInputSchema>;

export type BankAccountDto = {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  verifiedAt: string;
};

export const PAYOUT_STATUSES = ['pending', 'processing', 'success', 'failed'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** transfer = sent through the gateway; manual = paid outside the system and recorded here. */
export const PAYOUT_METHODS = ['transfer', 'manual'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const CreatePayoutSchema = z.object({
  riderId: ObjectIdSchema,
  amount: z.number().int().positive(),
  method: z.enum(PAYOUT_METHODS).default('transfer'),
  note: z.string().trim().max(200).optional(),
  reference: z.string().trim().max(100).optional(),
});
export type CreatePayoutInput = z.infer<typeof CreatePayoutSchema>;

/** Pay several riders at once — each gets their full available balance. */
export const BulkPayoutSchema = z.object({ riderIds: z.array(ObjectIdSchema).min(1).max(200) });

export const PayoutListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(PAYOUT_STATUSES).optional(),
  riderId: ObjectIdSchema.optional(),
});

export type PayoutDto = {
  id: string;
  reference: string;
  rider: { id: string; name: string; code: string };
  amount: number;
  method: PayoutMethod;
  status: PayoutStatus;
  bankAccount: Omit<BankAccountDto, 'verifiedAt'> | null;
  providerReference: string | null;
  failureReason: string | null;
  note: string | null;
  initiatedBy: { id: string; name: string } | null;
  completedAt: string | null;
  createdAt: string;
};

/** One row of the rider earnings table. Kobo throughout. */
export type RiderEarningsDto = {
  riderId: string;
  name: string;
  code: string;
  type: 'company' | 'partner';
  deliveredTrips: number;
  /** Fares on their delivered trips (partner riders). */
  grossFares: number;
  commission: number;
  earnings: number;
  paidOut: number;
  pendingPayouts: number;
  /** Customer cash still in the rider's hands. */
  cashHeld: number;
  /** earnings − paid out − pending − cash held. Positive = we can pay them. */
  available: number;
  bankAccount: BankAccountDto | null;
};
