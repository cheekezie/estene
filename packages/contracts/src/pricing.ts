import { z } from 'zod';
import { PARCEL_SIZES, SERVICE_LEVELS, type ParcelSize, type ServiceLevel } from './enums';
import { roundUpKobo, type Kobo } from './money';

/**
 * Pricing is admin-configured and every quote is an *estimate* until the
 * rider confirms the parcel at pickup. The same `computeQuote` runs on the
 * public site (instant estimate) and in the API (authoritative price), so the
 * two can never disagree on the formula.
 *
 *   total = round( (routeFare + sizeFee + extraWeight) × serviceMultiplier
 *                  + fragileFee + insurance )
 */

const kobo = z.number().int().nonnegative();

export const PricingConfigSchema = z.object({
  /** Fallback fare when no zone-to-zone route rate exists. */
  defaultRouteFare: kobo,
  /** Fallback between zones in different states when no specific route fare is set. */
  interstateFare: kobo.default(450_000),
  sizeFees: z.record(z.enum(PARCEL_SIZES), kobo),
  /** Weight included in the size fee before per-kg charges kick in. */
  includedKg: z.number().nonnegative(),
  perKgFee: kobo,
  serviceMultipliers: z.record(z.enum(SERVICE_LEVELS), z.number().min(1).max(5)),
  fragileFee: kobo,
  /** Percent of declared value, e.g. 1.5 = 1.5%. */
  insuranceRatePct: z.number().min(0).max(20),
  minInsuranceFee: kobo,
  /** Final price is rounded up to this many naira. */
  roundToNaira: z.number().int().min(1).max(1000),
});
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  defaultRouteFare: 250_000,
  interstateFare: 450_000,
  sizeFees: { envelope: 0, small: 50_000, medium: 120_000, large: 250_000, xlarge: 500_000 },
  includedKg: 5,
  perKgFee: 15_000,
  serviceMultipliers: { standard: 1, express: 1.6, same_day: 1.3 },
  fragileFee: 50_000,
  insuranceRatePct: 1,
  minInsuranceFee: 20_000,
  roundToNaira: 50,
};

export type QuoteInput = {
  /** Zone-to-zone fare resolved by the caller (route rate, intra-zone fare or default). */
  routeFare: Kobo;
  size: ParcelSize;
  weightKg: number;
  serviceLevel: ServiceLevel;
  fragile: boolean;
  /** Declared value in kobo; 0 = no insurance. */
  declaredValue: Kobo;
};

export type QuoteLine = { code: string; label: string; amount: Kobo };
export type Quote = { lines: QuoteLine[]; subtotal: Kobo; total: Kobo };

export function computeQuote(input: QuoteInput, config: PricingConfig): Quote {
  const lines: QuoteLine[] = [];
  const push = (code: string, label: string, amount: Kobo) => {
    if (amount > 0) lines.push({ code, label, amount: Math.round(amount) });
  };

  push('route', 'Delivery fare', input.routeFare);
  push('size', `${input.size} parcel`, config.sizeFees[input.size] ?? 0);

  const extraKg = Math.max(0, Math.ceil(input.weightKg - config.includedKg));
  push('weight', `Extra weight (${extraKg} kg)`, extraKg * config.perKgFee);

  const base = lines.reduce((sum, l) => sum + l.amount, 0);
  const multiplier = config.serviceMultipliers[input.serviceLevel] ?? 1;
  push('service', `${input.serviceLevel.replace('_', ' ')} service`, base * (multiplier - 1));

  if (input.fragile) push('fragile', 'Fragile handling', config.fragileFee);

  if (input.declaredValue > 0) {
    const insurance = Math.max(
      config.minInsuranceFee,
      (input.declaredValue * config.insuranceRatePct) / 100,
    );
    push('insurance', 'Goods protection', insurance);
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  return { lines, subtotal, total: roundUpKobo(subtotal, config.roundToNaira) };
}

export const RouteRateSchema = z.object({
  originZoneId: z.string().min(1),
  destinationZoneId: z.string().min(1),
  fare: kobo,
});
export type RouteRateInput = z.infer<typeof RouteRateSchema>;
