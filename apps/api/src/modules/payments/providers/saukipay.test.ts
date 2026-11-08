import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  apiKeyHeaderMatches,
  banksOf,
  isDuplicateReference,
  saukiSignature,
  findString,
  fromSaukiAmount,
  mapSaukiStatus,
  toSaukiAmount,
  transactionOf,
} from './saukipay.helpers';

describe('SaukiPay helpers', () => {
  it('converts amounts both ways', () => {
    expect(toSaukiAmount(250_050, 'naira')).toBe(2500.5);
    expect(toSaukiAmount(250_050, 'kobo')).toBe(250_050);
    expect(fromSaukiAmount(1025, 'naira')).toBe(102_500);
    expect(fromSaukiAmount('10.5', 'naira')).toBe(1050);
  });

  it('maps statuses, treating abandoned and refunded as failed', () => {
    expect(mapSaukiStatus('success')).toBe('success');
    expect(mapSaukiStatus('abandoned')).toBe('failed');
    expect(mapSaukiStatus('refunded')).toBe('failed');
    expect(mapSaukiStatus('pending')).toBe('pending');
  });

  it('finds the transaction whether data is flat or nested', () => {
    expect(transactionOf({ reference: 'ESP1', status: 'success' })?.reference).toBe('ESP1');
    expect(transactionOf({ statusCode: '00', tx: { reference: 'ESP2' } })?.reference).toBe('ESP2');
    expect(findString({ statusCode: '00', x: { checkout: 'https://pay/1' } }, 'checkout')).toBe(
      'https://pay/1',
    );
  });

  it('checks the ApiKey webhook header in constant time', () => {
    expect(apiKeyHeaderMatches('sk_live_abc', 'sk_live_abc')).toBe(true);
    expect(apiKeyHeaderMatches('ApiKey sk_live_abc', 'sk_live_abc')).toBe(true);
    expect(apiKeyHeaderMatches('sk_live_abd', 'sk_live_abc')).toBe(false);
    expect(apiKeyHeaderMatches(undefined, '')).toBe(false);
  });

  it('signs payout bodies with HMAC-SHA512 hex', () => {
    const body = JSON.stringify({ amount: 500, reference: 'PO1' });
    expect(saukiSignature(body, 'sk')).toBe(createHmac('sha512', 'sk').update(body).digest('hex'));
  });

  it('treats a reused payout reference as already sent, not failed', () => {
    expect(isDuplicateReference('Duplicate reference')).toBe(true);
    expect(isDuplicateReference('Reference already exists')).toBe(true);
    expect(isDuplicateReference('Insufficient wallet balance')).toBe(false);
  });

  it('reads the bank list', () => {
    expect(
      banksOf({
        statusCode: '00',
        banks: [
          { bankName: 'PAYCOM (OPAY)', bankCode: '305' },
          { bankName: 'Access bank', bankCode: '044' },
        ],
      }),
    ).toEqual([
      { code: '044', name: 'Access bank' },
      { code: '305', name: 'PAYCOM (OPAY)' },
    ]);
  });
});
