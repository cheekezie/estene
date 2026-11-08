import { env } from '../../../config/env';
import { safeEqual } from '../../../lib/crypto';
import { redis } from '../../../lib/redis';
import type { Bank, PaymentGateway } from './gateway';
import {
  collectReferences,
  fromGatewayAmount as fromAmount,
  mapChargeStatus,
  mapTransferStatus,
  signatureFor,
  toGatewayAmount as toAmount,
} from './sayswitch.helpers';

const toGatewayAmount = (kobo: number) => toAmount(kobo, env.SAYSWITCH_AMOUNT_UNIT);
const fromGatewayAmount = (v: unknown) => fromAmount(v, env.SAYSWITCH_AMOUNT_UNIT);

/**
 * SaySwitch (https://www.sayswitchgroup.com/docs). One base URL; test vs live
 * is decided by the secret key (sk_test_… / sk_live_…).
 *
 * Things the public docs leave open, and how this client copes:
 *  - Amount units: samples use naira decimal strings ("10.12") while two pages
 *    say "smallest unit". `SAYSWITCH_AMOUNT_UNIT` picks one (default naira);
 *    confirm with a sandbox payment before going live.
 *  - Hosted checkout issues its own `SSW_…` reference. We store it as the
 *    payment's providerReference and verify with it.
 *  - Webhook payloads are undocumented beyond the signature. We never trust
 *    the body: every reference in it is re-verified against the API.
 */

const TIMEOUT_MS = 20_000;
const BANKS_CACHE_KEY = 'sayswitch:banks';

type Envelope<T> = { success?: boolean; status?: boolean; message?: string; data?: T };

class SaySwitchError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  const res = await fetch(`${env.SAYSWITCH_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.SAYSWITCH_SECRET_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let json: Envelope<T>;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    throw new SaySwitchError(`SaySwitch responded ${res.status} with no JSON`, res.status);
  }
  const ok = res.ok && (json.success ?? json.status) !== false;
  if (!ok)
    throw new SaySwitchError(json.message ?? `SaySwitch responded ${res.status}`, res.status);
  return json.data as T;
}

// ── The gateway ─────────────────────────────────────────────────────────────

type ChargeData = {
  status?: string;
  amount?: string | number;
  requested_amount?: string | number;
  fees?: string | number;
  reference?: string;
  gateway_response?: string;
  channel?: string;
};

type PayoutData = {
  status?: string;
  reference?: string;
  sessionid?: string | null;
  gateway_response?: string;
  message?: string;
};

export const SaySwitchGateway: PaymentGateway = {
  name: 'sayswitch',

  async checkoutSession({ reference, amount, customer, returnUrl }) {
    const data = await call<{ authorization_url: string; reference: string }>(
      'POST',
      '/api/v1/transaction/initialize',
      {
        email: customer.email,
        amount: toGatewayAmount(amount),
        currency: 'NGN',
        callback: returnUrl,
        // Not in the documented schema; harmless if ignored, useful if honoured.
        reference,
        metadata: { estene_reference: reference, name: customer.name, phone: customer.phone },
      },
    );
    return {
      reference,
      amount,
      provider: 'sayswitch',
      checkoutUrl: data.authorization_url,
      providerReference: data.reference,
    };
  },

  async verify({ reference, providerReference, amount }) {
    let data: ChargeData;
    try {
      data = await call<ChargeData>(
        'GET',
        `/api/v1/transaction/verify/${encodeURIComponent(providerReference ?? reference)}`,
      );
    } catch (err) {
      // Not found yet (customer never opened checkout, transfer not landed) = still pending.
      if (err instanceof SaySwitchError && err.httpStatus === 404)
        return { status: 'pending', amountPaid: 0, responseDescription: 'Not found at gateway' };
      throw err;
    }
    const status = mapChargeStatus(data.status);
    // `amount` includes fees the customer paid; what reached us for the order is `requested_amount`.
    const paid =
      data.requested_amount !== undefined
        ? fromGatewayAmount(data.requested_amount)
        : fromGatewayAmount(data.amount) - fromGatewayAmount(data.fees);
    void amount;
    return {
      status,
      amountPaid: status === 'success' ? paid : 0,
      providerReference: data.reference ?? providerReference,
      responseCode: data.status,
      responseDescription: data.gateway_response ?? data.status,
    };
  },

  async createVirtualAccount({ reference, amount, accountName, customer }) {
    const data = await call<{ account_number: string; bank_name: string; account_name?: string }>(
      'POST',
      '/api/s2s/banktransfer/initialize',
      { email: customer.email, amount: toGatewayAmount(amount), currency: 'NGN', reference },
    );
    return {
      accountNumber: data.account_number,
      bankName: data.bank_name,
      accountName: data.account_name ?? accountName,
      // SaySwitch doesn't document an expiry; we stop showing the account after a day.
      expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    };
  },

  async listBanks(): Promise<Bank[]> {
    const cached = await redis.get(BANKS_CACHE_KEY);
    if (cached) return JSON.parse(cached) as Bank[];
    const rows = await call<{ bankName: string; bankCode: string }[]>('GET', '/api/v1/bank_list');
    const banks = rows
      .map((b) => ({ code: b.bankCode, name: b.bankName }))
      .sort((a, b) => a.name.localeCompare(b.name));
    await redis.set(BANKS_CACHE_KEY, JSON.stringify(banks), 'EX', 86_400);
    return banks;
  },

  async nameEnquiry({ bankCode, accountNumber }) {
    const data = await call<string | { account_name?: string }>(
      'POST',
      '/api/v1/account_name_verify',
      { bank_code: bankCode, account_number: accountNumber, currency: 'NGN' },
    );
    const accountName = typeof data === 'string' ? data : data?.account_name;
    if (!accountName) throw new Error('Account name not returned');
    return { accountName };
  },

  async transfer({ reference, amount, bankCode, bankName, accountNumber, accountName, narration }) {
    try {
      const data = await call<PayoutData>('POST', '/api/v1/bank_transfer', {
        reference,
        amount: toGatewayAmount(amount),
        currency: 'NGN',
        bank_code: bankCode,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        narration: narration.slice(0, 100),
      });
      return {
        status: mapTransferStatus(data.status),
        providerReference: data.sessionid ?? data.reference,
        message: data.gateway_response ?? data.message,
      };
    } catch (err) {
      // A 4xx is a definite refusal (bad account, insufficient balance). A timeout or
      // 5xx may still have gone out — leave it pending and let the status check settle it.
      if (err instanceof SaySwitchError && err.httpStatus >= 400 && err.httpStatus < 500)
        return { status: 'failed', message: err.message };
      return { status: 'pending', message: (err as Error).message };
    }
  },

  async transferStatus(reference) {
    try {
      const data = await call<PayoutData>('GET', `/api/v1/payout/${encodeURIComponent(reference)}`);
      return {
        status: mapTransferStatus(data.status),
        providerReference: data.sessionid ?? data.reference,
        message: data.gateway_response ?? data.message,
      };
    } catch (err) {
      if (err instanceof SaySwitchError && err.httpStatus === 404)
        return { status: 'failed', message: 'Transfer not found at SaySwitch' };
      return { status: 'pending', message: (err as Error).message };
    }
  },

  verifyWebhook(rawBody, headers) {
    const header = headers['payloadsignature'];
    const given = (Array.isArray(header) ? header[0] : header)?.trim().toLowerCase();
    return (
      !!given &&
      !!env.SAYSWITCH_SECRET_KEY &&
      safeEqual(given, signatureFor(rawBody, env.SAYSWITCH_SECRET_KEY))
    );
  },

  parseWebhook(rawBody) {
    try {
      return { references: collectReferences(JSON.parse(rawBody)) };
    } catch {
      return { references: [] };
    }
  },
};
