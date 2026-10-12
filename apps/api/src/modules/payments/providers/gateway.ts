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

/**
 * Everything Estene needs from a payment gateway. SaySwitch will be the real
 * implementation (checkout, verify, virtual accounts, payouts, webhooks);
 * the simulator stands in until then.
 */
export interface PaymentGateway {
  readonly name: Exclude<PaymentProvider, 'offline'>;
  checkoutSession(p: {
    reference: string;
    amount: number;
    customer: Customer;
    returnUrl: string;
  }): CheckoutSession;
  /** Authoritative status — always called before a payment is trusted. */
  verify(p: { reference: string; amount: number }): Promise<GatewayStatus>;
  createVirtualAccount(p: {
    reference: string;
    amount: number;
    accountName: string;
  }): Promise<VirtualAccountDto>;
  nameEnquiry(p: { bankCode: string; accountNumber: string }): Promise<{ accountName: string }>;
  transfer(p: {
    reference: string;
    amount: number;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    narration: string;
  }): Promise<TransferResult>;
  /** Validates a webhook's signature against the raw body. */
  verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
  /** Pulls our payment reference out of a webhook body (we then call `verify`, never trusting the body). */
  referenceFromWebhook(rawBody: string): string | null;
}
