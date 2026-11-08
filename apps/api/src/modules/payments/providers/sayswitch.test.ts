import { describe, expect, it } from 'vitest';
import {
  collectReferences,
  fromGatewayAmount,
  mapChargeStatus,
  mapTransferStatus,
  signatureFor,
  toGatewayAmount,
} from './sayswitch.helpers';

describe('SaySwitch amounts', () => {
  it('sends naira decimals by default and kobo when configured', () => {
    expect(toGatewayAmount(250_050, 'naira')).toBe('2500.50');
    expect(toGatewayAmount(250_050, 'kobo')).toBe('250050');
  });
  it('reads amounts back into integer kobo', () => {
    expect(fromGatewayAmount('10.12', 'naira')).toBe(1012);
    expect(fromGatewayAmount(1012, 'kobo')).toBe(1012);
    expect(fromGatewayAmount('garbage', 'naira')).toBe(0);
  });
});

describe('SaySwitch statuses', () => {
  it('maps collections', () => {
    expect(mapChargeStatus('success')).toBe('success');
    expect(mapChargeStatus('cancelled')).toBe('failed');
    expect(mapChargeStatus('something-new')).toBe('pending');
  });
  it('maps payouts, treating reversed as failed', () => {
    expect(mapTransferStatus('completed')).toBe('success');
    expect(mapTransferStatus('reversed')).toBe('failed');
    expect(mapTransferStatus(undefined)).toBe('pending');
  });
});

describe('SaySwitch webhooks', () => {
  it('signs the raw body with HMAC-SHA512 hex', () => {
    const sig = signatureFor('{"a":1}', 'sk_test_x');
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(signatureFor('{"a":1}', 'sk_test_x')).toBe(sig);
    expect(signatureFor('{"a": 1}', 'sk_test_x')).not.toBe(sig);
  });
  it('finds references anywhere in an undocumented body', () => {
    const refs = collectReferences({
      type: 'payment.success',
      data: { reference: 'SSW_123', meta: { merchant_reference: 'ESPABC' }, amount: '10' },
    });
    expect(refs.sort()).toEqual(['ESPABC', 'SSW_123']);
  });
});
