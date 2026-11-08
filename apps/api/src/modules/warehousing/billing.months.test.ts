import { describe, expect, it } from 'vitest';
import { monthBounds, previousMonth } from './billing.months';

describe('warehousing billing months', () => {
  it('bills the month just ended, in Lagos time', () => {
    expect(previousMonth(new Date('2026-11-01T00:30:00Z'))).toBe('2026-10');
    // 23:30 UTC on 31 Oct is already 1 Nov in Lagos.
    expect(previousMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10');
    expect(previousMonth(new Date('2026-10-31T22:30:00Z'))).toBe('2026-09');
    expect(previousMonth(new Date('2027-01-01T05:00:00Z'))).toBe('2026-12');
  });

  it('gives month bounds at Lagos midnight', () => {
    const { start, end } = monthBounds('2026-10');
    expect(start.toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });
});
