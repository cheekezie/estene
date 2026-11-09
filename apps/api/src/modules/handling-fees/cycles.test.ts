import { describe, expect, it } from 'vitest';
import { handlingFeeFor } from '@estene/contracts/handling-fee';
import { cycleAt, cycleBounds } from './cycles';

// 8 Nov 2026, 14:30 in Lagos.
const anchor = new Date('2026-11-08T13:30:00Z');

describe('handling fee cycles', () => {
  it('runs monthly from the activation day, at Lagos midnight', () => {
    expect(cycleBounds(anchor, 1)).toEqual({
      start: new Date('2026-11-07T23:00:00Z'),
      end: new Date('2026-12-07T23:00:00Z'),
    });
    expect(cycleBounds(anchor, 2)).toEqual({
      start: new Date('2026-12-07T23:00:00Z'),
      end: new Date('2027-01-07T23:00:00Z'),
    });
  });

  it('crosses years', () => {
    expect(cycleBounds(anchor, 14).start).toEqual(new Date('2027-12-07T23:00:00Z'));
  });

  it('clamps a month-end anchor to shorter months, then returns to the anchor day', () => {
    const jan31 = new Date('2027-01-31T10:00:00Z');
    expect(cycleBounds(jan31, 1).end).toEqual(new Date('2027-02-27T23:00:00Z')); // 28 Feb
    expect(cycleBounds(jan31, 2).end).toEqual(new Date('2027-03-30T23:00:00Z')); // 31 Mar
    expect(cycleBounds(jan31, 3).end).toEqual(new Date('2027-04-29T23:00:00Z')); // 30 Apr
  });

  it('finds the running cycle', () => {
    expect(cycleAt(anchor, new Date('2026-11-01T00:00:00Z'))).toBe(0);
    expect(cycleAt(anchor, anchor)).toBe(1);
    // 7 Dec 23:59 Lagos is still cycle 1; 8 Dec 00:00 Lagos is cycle 2.
    expect(cycleAt(anchor, new Date('2026-12-07T22:59:00Z'))).toBe(1);
    expect(cycleAt(anchor, new Date('2026-12-07T23:00:00Z'))).toBe(2);
    // 3 Dec Lagos time is before the 8th, so still cycle 1 even though the month changed.
    expect(cycleAt(anchor, new Date('2026-12-03T12:00:00Z'))).toBe(1);
  });
});

describe('handling fee price', () => {
  it('charges a block per 20 units, rounded up, and nothing for no stock', () => {
    expect(handlingFeeFor(0, 20, 500_000)).toEqual({ blocks: 0, amount: 0 });
    expect(handlingFeeFor(10, 20, 500_000)).toEqual({ blocks: 1, amount: 500_000 });
    expect(handlingFeeFor(20, 20, 500_000)).toEqual({ blocks: 1, amount: 500_000 });
    expect(handlingFeeFor(21, 20, 500_000)).toEqual({ blocks: 2, amount: 1_000_000 });
  });
});
