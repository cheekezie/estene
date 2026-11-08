import { createHmac, timingSafeEqual } from 'node:crypto';

/** Pure SaukiPay helpers — no env, no network — so they can be unit tested. */

export type AmountUnit = 'naira' | 'kobo';

export const toSaukiAmount = (kobo: number, unit: AmountUnit) =>
  unit === 'kobo' ? kobo : Math.round(kobo) / 100;

export const fromSaukiAmount = (v: unknown, unit: AmountUnit) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '0'));
  if (!Number.isFinite(n)) return 0;
  return unit === 'kobo' ? Math.round(n) : Math.round(n * 100);
};

/** success | pending | failed | abandoned | refunded (docs). Unknown stays pending. */
export function mapSaukiStatus(s: unknown): 'success' | 'pending' | 'failed' {
  const v = String(s ?? '').toLowerCase();
  if (v === 'success' || v === 'successful') return 'success';
  if (['failed', 'abandoned', 'refunded', 'cancelled', 'reversed'].includes(v)) return 'failed';
  return 'pending';
}

/**
 * The transaction inside a response or webhook. Docs show `data` holding the
 * fields directly (webhook) and nested next to `statusCode` (API), so look
 * one level down for the object that carries the reference.
 */
export function transactionOf(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.reference === 'string') return d;
  for (const v of Object.values(d))
    if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).reference === 'string')
      return v as Record<string, unknown>;
  return null;
}

/** First string found under `key` anywhere in the object (e.g. the checkout URL). */
export function findString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === key && typeof v === 'string') return v;
    const nested = findString(v, key);
    if (nested) return nested;
  }
  return undefined;
}

/** Webhooks carry the secret key in an `ApiKey` header (optionally prefixed "ApiKey "). */
export function apiKeyHeaderMatches(header: string | string[] | undefined, secret: string) {
  const value = (Array.isArray(header) ? header[0] : header) ?? '';
  const received = Buffer.from(value.replace(/^ApiKey /i, '').trim());
  const expected = Buffer.from(secret);
  return (
    expected.length > 0 &&
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

/**
 * Payout requests carry an HMAC-SHA512 of the exact JSON body sent, keyed with
 * the secret key, hex encoded.
 */
export function saukiSignature(body: string, secret: string) {
  return createHmac('sha512', secret).update(body, 'utf8').digest('hex');
}

/**
 * SaukiPay refuses a reused payout reference. On a retry that means the first
 * attempt reached them, so it is not a failure — the status check settles it.
 */
export const isDuplicateReference = (message: string) =>
  /duplicate|already (exists|been used|used|logged)|reference.*(exists|used)/i.test(message);

/** Bank list entries: `{ bankName, bankCode }`. */
export function banksOf(data: unknown): { code: string; name: string }[] {
  const list = data && typeof data === 'object' ? (data as { banks?: unknown }).banks : undefined;
  if (!Array.isArray(list)) return [];
  return list
    .map((b: { bankCode?: unknown; bankName?: unknown }) => ({
      code: String(b.bankCode ?? ''),
      name: String(b.bankName ?? '').trim(),
    }))
    .filter((b) => b.code && b.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}
