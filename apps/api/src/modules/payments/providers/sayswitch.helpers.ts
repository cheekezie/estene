import { createHmac } from 'node:crypto';

/** Pure SaySwitch helpers — no env, no network — so they can be unit tested. */

export type AmountUnit = 'naira' | 'kobo';

// ── Money ───────────────────────────────────────────────────────────────────

/** Kobo → what SaySwitch expects. */
export const toGatewayAmount = (kobo: number, unit: AmountUnit) =>
  unit === 'kobo' ? String(kobo) : (kobo / 100).toFixed(2);

/** What SaySwitch reports → kobo. */
export const fromGatewayAmount = (v: unknown, unit: AmountUnit) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '0'));
  if (!Number.isFinite(n)) return 0;
  return unit === 'kobo' ? Math.round(n) : Math.round(n * 100);
};

// ── Status mapping ──────────────────────────────────────────────────────────

/** Collections: success | pending | failed | cancelled (docs); anything unknown stays pending. */
export function mapChargeStatus(s: unknown): 'success' | 'pending' | 'failed' {
  const v = String(s ?? '').toLowerCase();
  if (v === 'success' || v === 'successful' || v === 'completed') return 'success';
  if (['failed', 'cancelled', 'canceled', 'abandoned', 'declined', 'reversed'].includes(v))
    return 'failed';
  return 'pending';
}

/** Payouts: pending | success | completed | failed | reversed; unknown stays pending. */
export function mapTransferStatus(s: unknown): 'success' | 'pending' | 'failed' {
  const v = String(s ?? '').toLowerCase();
  if (v === 'success' || v === 'successful' || v === 'completed') return 'success';
  if (['failed', 'reversed', 'cancelled', 'canceled', 'declined'].includes(v)) return 'failed';
  return 'pending';
}

// ── Webhooks ────────────────────────────────────────────────────────────────

/** `payloadSignature` = hex HMAC-SHA512 of the raw body, keyed with the secret key. */
export function signatureFor(rawBody: string, secret: string) {
  return createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
}

/** Every string under a key that looks like a reference, anywhere in the body. */
export function collectReferences(body: unknown, out = new Set<string>()): string[] {
  if (body && typeof body === 'object') {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (typeof v === 'string' && /reference|^ref$|^tx_?ref$/i.test(k) && v.length <= 100)
        out.add(v);
      else if (v && typeof v === 'object') collectReferences(v, out);
    }
  }
  return [...out];
}
