import { describe, expect, it } from 'vitest';
import { signPayload, verifySignature } from './webhooks.signing';

describe('webhook signatures', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ id: 'evt_1', type: 'ping' });

  it('verifies its own signature', () => {
    expect(verifySignature(secret, body, signPayload(secret, body))).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifySignature(secret, body + ' ', signPayload(secret, body))).toBe(false);
  });

  it('rejects stale timestamps (replay)', () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(verifySignature(secret, body, signPayload(secret, body, old))).toBe(false);
  });
});
