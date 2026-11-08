import type {
  CheckoutSession,
  PaymentProvider,
  VirtualAccountDto,
} from '@estene/contracts/payment';

export type GatewayStatus = {
  status: 'success' | 'pending' | 'failed';
  /** Amount the gateway says was paid, kobo. Must match before value is given. */
  amountPaid: number;
  providerReference?: string;
  responseCode?: string;
  responseDescription?: string;
};

export type TransferResult = {
  status: 'success' | 'pending' | 'failed';
  providerReference?: string;
  message?: string;
};

export type Customer = { name: string; phone: string; email: string };

export type Bank = { code: string; name: string };

/**
 * What a webhook told us, before we trust it. We never act on the body:
 * every reference found here is re-checked with `verify` / `transferStatus`.
 */
export type WebhookNotice = { references: string[] };

/**
 * Money in: hosted checkout, status checks and (where the gateway has them)
 * one-off account numbers for bank transfer.
 */
export interface CollectionGateway {
  readonly name: Exclude<PaymentProvider, 'offline'>;
  /**
   * Hosted checkout. Some gateways issue their own transaction reference;
   * it comes back as `providerReference` and must be stored for `verify`.
   */
  checkoutSession(p: {
    reference: string;
    amount: number;
    customer: Customer;
    returnUrl: string;
  }): Promise<CheckoutSession & { providerReference?: string }>;
  /** Authoritative status — always called before a payment is trusted. */
  verify(p: {
    reference: string;
    providerReference?: string;
    amount: number;
  }): Promise<GatewayStatus>;
  /**
   * A dedicated account number for one payment. Optional: without it, bank
   * transfer happens inside the hosted checkout and customers get a pay link.
   */
  createVirtualAccount?(p: {
    reference: string;
    amount: number;
    accountName: string;
    customer: Customer;
  }): Promise<VirtualAccountDto>;
  /** Validates a webhook against the raw body and headers. */
  verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
  /** Pulls candidate references out of a webhook body (we then re-verify each, never trusting the body). */
  parseWebhook(rawBody: string): WebhookNotice;
}

/** Money out: bank payouts to riders (and later fleets). */
export interface PayoutGateway {
  readonly name: Exclude<PaymentProvider, 'offline'>;
  /** Banks payouts can go to, with the codes this gateway expects. */
  listBanks(): Promise<Bank[]>;
  nameEnquiry(p: { bankCode: string; accountNumber: string }): Promise<{ accountName: string }>;
  transfer(p: {
    reference: string;
    amount: number;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
    narration: string;
  }): Promise<TransferResult>;
  /** Authoritative status of a payout we sent. */
  transferStatus(reference: string): Promise<TransferResult>;
  verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(rawBody: string): WebhookNotice;
}

/** Every gateway does both; PAYMENTS_PROVIDER picks one for money in and out. */
export type PaymentGateway = CollectionGateway & PayoutGateway;
