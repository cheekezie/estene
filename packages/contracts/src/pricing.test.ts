import { describe, expect, it } from 'vitest';
import { computeQuote, DEFAULT_PRICING_CONFIG as cfg } from './pricing';
import { canTransition } from './order-status';

const base = { routeFare: 200_000, size: 'small', weightKg: 2, serviceLevel: 'standard', fragile: false, declaredValue: 0 } as const;

describe('computeQuote', () => {
  it('adds route fare and size fee, rounded up to ₦50', () => {
    const q = computeQuote(base, cfg);
    expect(q.subtotal).toBe(250_000);
    expect(q.total).toBe(250_000);
  });

  it('charges per extra kg above the included weight', () => {
    const q = computeQuote({ ...base, weightKg: 7.2 }, cfg);
    expect(q.lines.find((l) => l.code === 'weight')?.amount).toBe(3 * cfg.perKgFee);
  });

  it('applies the service multiplier to the base, not to add-ons', () => {
    const q = computeQuote({ ...base, serviceLevel: 'express', fragile: true }, cfg);
    expect(q.lines.find((l) => l.code === 'service')?.amount).toBe(150_000);
    expect(q.subtotal).toBe(250_000 + 150_000 + cfg.fragileFee);
  });

  it('enforces the minimum insurance fee', () => {
    const q = computeQuote({ ...base, declaredValue: 100_000 }, cfg);
    expect(q.lines.find((l) => l.code === 'insurance')?.amount).toBe(cfg.minInsuranceFee);
  });
});

describe('order state machine', () => {
  it('blocks skipping straight to delivered', () => {
    expect(canTransition('created', 'delivered', 'rider')).toBe(false);
  });
  it('only lets riders confirm pickup', () => {
    expect(canTransition('en_route_to_pickup', 'picked_up', 'rider')).toBe(true);
    expect(canTransition('en_route_to_pickup', 'picked_up', 'admin')).toBe(false);
  });
});
