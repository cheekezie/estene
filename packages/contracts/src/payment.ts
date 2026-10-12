import { z } from 'zod';
import type { PaymentMethod } from './enums';
import { ObjectIdSchema, PaginationQuerySchema } from './common';

/** How money arrived. Online channels go through the gateway; cash and manual are recorded by people. */
export const PAYMENT_CHANNELS = ['checkout', 'virtual_account', 'cash', 'manual'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
  checkout: 'Online checkout',
  virtual_account: 'Bank transfer (account number)',
  cash: 'Cash to rider',
  manual: 'Recorded by staff',
};

/** booking = the price at checkout; balance = the extra owed after the rider re-priced at pickup. */
export const PAYMENT_PURPOSES = ['booking', 'balance'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const TRANSACTION_STATUSES = ['pending', 'success', 'failed', 'expired'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_PROVIDERS = ['sayswitch', 'simulator', 'offline'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export type VirtualAccountDto = {
  accountNumber: string;
  bankName: string;
  accountName: string;
  expiresAt: string;
};

/** Hosted checkout: the browser is sent to `checkoutUrl` and returns to our site afterwards. */
export type CheckoutSession = {
  reference: string;
  amount: number;
  provider: PaymentProvider;
  checkoutUrl: string;
};

export type TransactionDto = {
  id: string;
  reference: string;
  shipment: { id: string; trackingNumber: string } | null;
  client: { id: string; name: string } | null;
  customer: { name: string; phone: string; email?: string };
  purpose: PaymentPurpose;
  channel: PaymentChannel;
  method: PaymentMethod;
  provider: PaymentProvider;
  amount: number;
  status: TransactionStatus;
  providerReference: string | null;
  responseCode: string | null;
  responseDescription: string | null;
  virtualAccount: VirtualAccountDto | null;
  collectedBy: { id: string; name: string } | null;
  recordedBy: { id: string; name: string } | null;
  paidAt: string | null;
  createdAt: string;
};

export type TransactionDetailDto = TransactionDto & {
  events: { type: string; at: string; note: string | null }[];
};

export const TransactionListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(TRANSACTION_STATUSES).optional(),
  channel: z.enum(PAYMENT_CHANNELS).optional(),
  shipmentId: ObjectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type TransactionListQuery = z.infer<typeof TransactionListQuerySchema>;

export type TransactionSummaryDto = {
  count: number;
  successful: number;
  collected: number;
  pending: number;
  failed: number;
};
