import { env } from '../../../config/env';
import type { Bank, PaymentGateway, TransferResult } from './gateway';
import {
  apiKeyHeaderMatches,
  banksOf,
  findString,
  fromSaukiAmount,
  isDuplicateReference,
  mapSaukiStatus,
  saukiSignature,
  toSaukiAmount,
  transactionOf,
} from './saukipay.helpers';

/**
 * SaukiPay (https://docs.saukipay.net/docs/integrations/api): customer payments
 * and rider payouts from the SaukiPay wallet.
 *
 * - Hosted checkout covers card, bank transfer and USSD; there is no separate
 *   one-off account number, so customers who want to transfer get a pay link.
 * - Payouts: add a recipient, then pay it from the wallet. Payout requests are
 *   signed (HMAC-SHA512 of the body) on top of the bearer key.
 *
 * Calls must come from an IP whitelisted on the SaukiPay Developer page.
 */
const TIMEOUT_MS = 20_000;
/** Header carrying the payout request signature. */
const SIGNATURE_HEADER = 'x-saukipay-signature';
const BANKS_TTL_MS = 6 * 60 * 60_000;

class SaukiPayError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

type Envelope = { status?: string; message?: string; data?: unknown };

async function call(method: 'GET' | 'POST', path: string, body?: object, signed = false) {
  const payload = body ? JSON.stringify(body) : undefined;
  const secret = env.SAUKIPAY_SECRET_KEY ?? '';
  const res = await fetch(`${env.SAUKIPAY_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(signed && payload ? { [SIGNATURE_HEADER]: saukiSignature(payload, secret) } : {}),
    },
    body: payload,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let json: Envelope;
  try {
    json = (await res.json()) as Envelope;
  } catch {
    throw new SaukiPayError(`SaukiPay responded ${res.status} with no JSON`, res.status);
  }
  const code = findString(json.data, 'statusCode');
  const ok =
    res.ok && json.status !== 'error' && json.status !== 'failed' && (!code || code === '00');
  if (!ok) throw new SaukiPayError(json.message ?? `SaukiPay responded ${res.status}`, res.status);
  return json.data;
}

const unit = () => env.SAUKIPAY_AMOUNT_UNIT;

let banksCache: { at: number; banks: Bank[] } | null = null;

/** A 4xx is a definite refusal; a timeout or 5xx may still have gone out. */
const definiteRefusal = (err: unknown) =>
  err instanceof SaukiPayError && err.httpStatus >= 400 && err.httpStatus < 500;

export const SaukiPayGateway: PaymentGateway = {
  name: 'saukipay',

  async checkoutSession({ reference, amount, customer, returnUrl }) {
    const data = await call('POST', '/transaction/init', {
      reference,
      amount: toSaukiAmount(amount, unit()),
      currency: 'NGN',
      callback_url: returnUrl,
      customer: { payerName: customer.name, email: customer.email, phoneNumber: customer.phone },
    });
    const checkoutUrl = findString(data, 'checkout');
    if (!checkoutUrl) throw new SaukiPayError('SaukiPay did not return a checkout link', 502);
    return {
      reference,
      amount,
      provider: 'saukipay',
      checkoutUrl,
      providerReference: findString(data, 'reference') ?? reference,
    };
  },

  async verify({ reference, providerReference }) {
    let data: unknown;
    try {
      data = await call(
        'GET',
        `/transaction/verify/${encodeURIComponent(providerReference ?? reference)}`,
      );
    } catch (err) {
      // No such transaction yet: the customer never reached checkout.
      if (err instanceof SaukiPayError && err.httpStatus === 404)
        return { status: 'pending', amountPaid: 0, responseDescription: 'Not found at SaukiPay' };
      throw err;
    }
    const tx = transactionOf(data) ?? {};
    const status = mapSaukiStatus(tx.status);
    return {
      status,
      // `amount` is what the customer paid; `settledAmount` is after SaukiPay's fee.
      amountPaid: status === 'success' ? fromSaukiAmount(tx.amount, unit()) : 0,
      providerReference: typeof tx.reference === 'string' ? tx.reference : providerReference,
      responseCode: typeof tx.status === 'string' ? tx.status : undefined,
      responseDescription:
        (typeof tx.processorResponse === 'string' && tx.processorResponse) ||
        (typeof tx.paymentChannel === 'string' ? `Paid by ${tx.paymentChannel}` : undefined),
    };
  },

  // ── Payouts ──

  async listBanks() {
    if (banksCache && Date.now() - banksCache.at < BANKS_TTL_MS) return banksCache.banks;
    const banks = banksOf(await call('GET', '/config/bank-list'));
    if (banks.length) banksCache = { at: Date.now(), banks };
    return banks;
  },

  async nameEnquiry({ bankCode, accountNumber }) {
    const data = await call('POST', '/config/account-name-verify', {
      accountNumber,
      bankCode,
      currency: 'NGN',
    });
    // The docs return the account name in `data.banks`.
    const accountName = findString(data, 'banks') ?? findString(data, 'accountName');
    if (!accountName) throw new SaukiPayError('Account name not returned', 502);
    return { accountName };
  },

  async transfer({ reference, amount, bankCode, bankName, accountNumber, accountName, narration }) {
    let recipientCode: string | undefined;
    try {
      const recipient = await call(
        'POST',
        '/transaction/add-payout-recipient',
        { type: 'nuban', name: accountName, accountNumber, bankCode, bankName, currency: 'NGN' },
        true,
      );
      recipientCode = findString(recipient, 'recipientCode');
      if (!recipientCode) throw new SaukiPayError('SaukiPay did not return a recipient code', 502);
    } catch (err) {
      // Nothing has been sent yet, so any refusal here is safe to report as failed.
      return { status: 'failed', message: (err as Error).message };
    }
    try {
      await call(
        'POST',
        '/transaction/init-payout',
        {
          source: 'wallet',
          recipientCode,
          reason: narration.slice(0, 100),
          amount: toSaukiAmount(amount, unit()),
          reference,
          currency: 'NGN',
        },
        true,
      );
      // Accepted for processing, not delivered: the webhook or sweep settles it.
      return { status: 'pending', providerReference: reference };
    } catch (err) {
      const message = (err as Error).message;
      if (definiteRefusal(err) && !isDuplicateReference(message))
        return { status: 'failed', message };
      return { status: 'pending', message };
    }
  },

  async transferStatus(reference): Promise<TransferResult> {
    try {
      const tx = transactionOf(
        await call('GET', `/transaction/verify/${encodeURIComponent(reference)}`),
      );
      return {
        status: mapSaukiStatus(tx?.status),
        providerReference: reference,
        message: typeof tx?.status === 'string' ? tx.status : undefined,
      };
    } catch (err) {
      if (err instanceof SaukiPayError && err.httpStatus === 404)
        return { status: 'failed', message: 'Payout not found at SaukiPay' };
      return { status: 'pending', message: (err as Error).message };
    }
  },

  verifyWebhook(_rawBody, headers) {
    return apiKeyHeaderMatches(headers['apikey'], env.SAUKIPAY_SECRET_KEY ?? '');
  },

  parseWebhook(rawBody) {
    try {
      const body = JSON.parse(rawBody) as { data?: unknown };
      const ref = transactionOf(body.data)?.reference;
      return { references: typeof ref === 'string' ? [ref] : [] };
    } catch {
      return { references: [] };
    }
  },
};
