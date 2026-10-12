import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signature scheme (documented for integrators in docs/integrations.md):
 *
 *   Estene-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * Including the timestamp in the signed string lets receivers reject replays.
 */
export function signPayload(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** Reference verifier — mirrors what we tell integrators to implement. */
export function verifySignature(secret: string, body: string, header: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(signPayload(secret, body, t).split('v1=')[1]!, 'hex');
  const given = Buffer.from(parts.v1, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
