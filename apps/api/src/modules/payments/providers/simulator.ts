import { randomInt } from 'node:crypto';
import { NIGERIAN_BANKS } from '@estene/contracts/banks';
import { env } from '../../../config/env';
import { redis } from '../../../lib/redis';
import type { PaymentGateway } from './gateway';

/**
 * Development-only stand-in for the payment gateway. The "checkout" is a page served
 * by our own API where you choose the outcome; virtual-account payments and
 * payouts can be completed from the admin. Refused in production (see env.ts).
 */
const outcomeKey = (ref: string) => `sim:payment:${ref}`;

export const SimulatorGateway: PaymentGateway & {
  setOutcome(ref: string, outcome: 'success' | 'failed', amount: number): Promise<void>;
} = {
  name: 'simulator',

  async setOutcome(ref, outcome, amount) {
    await redis.set(outcomeKey(ref), JSON.stringify({ outcome, amount }), 'EX', 86_400);
  },

  async checkoutSession({ reference, amount, returnUrl }) {
    const checkoutUrl = `${env.API_PUBLIC_URL}/api/public/payments/${reference}/simulate?return=${encodeURIComponent(returnUrl)}`;
    return { reference, amount, provider: 'simulator', checkoutUrl };
  },

  async verify({ amount, reference }) {
    const raw = await redis.get(outcomeKey(reference));
    if (!raw)
      return {
        status: 'pending',
        amountPaid: 0,
        responseCode: 'Z0',
        responseDescription: 'Awaiting payment',
      };
    const { outcome, amount: paid } = JSON.parse(raw) as {
      outcome: 'success' | 'failed';
      amount: number;
    };
    return outcome === 'success'
      ? {
          status: 'success',
          amountPaid: paid ?? amount,
          providerReference: `SIM${reference.slice(-8)}`,
          responseCode: '00',
          responseDescription: 'Approved (simulated)',
        }
      : {
          status: 'failed',
          amountPaid: 0,
          responseCode: 'Z6',
          responseDescription: 'Declined (simulated)',
        };
  },

  async createVirtualAccount({ accountName }) {
    return {
      accountNumber: `99${randomInt(10_000_000, 99_999_999)}`,
      bankName: 'Simulated Bank',
      accountName,
      expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    };
  },

  async listBanks() {
    return NIGERIAN_BANKS.map((b) => ({ code: b.code, name: b.name }));
  },

  async nameEnquiry({ accountNumber }) {
    return { accountName: `TEST ACCOUNT ${accountNumber.slice(-4)}` };
  },

  async transfer({ reference }) {
    return {
      status: 'success',
      providerReference: `SIMTRF${reference.slice(-8)}`,
      message: 'Transfer simulated',
    };
  },

  async transferStatus(reference) {
    return { status: 'success', providerReference: `SIMTRF${reference.slice(-8)}` };
  },

  verifyWebhook: () => true,
  parseWebhook: (raw) => {
    const ref = (JSON.parse(raw) as { reference?: string }).reference;
    return { references: ref ? [ref] : [] };
  },
};
