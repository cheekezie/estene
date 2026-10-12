import { Schema, model } from 'mongoose';
import type { PricingConfig } from '@estene/contracts/pricing';

/**
 * Singleton (key = "default"). Every save bumps `version`; shipments store the
 * version they were priced with, so old quotes stay explainable after edits.
 */
export interface IPricingConfig extends PricingConfig {
  key: string;
  version: number;
  /** Platform default commission on partner rider trips, percent. */
  partnerCommissionPct: number;
  /** Max jobs a rider may hold at once before dispatch skips them. */
  maxActiveJobsPerRider: number;
  updatedBy?: string;
  updatedAt: Date;
}

const pricingConfigSchema = new Schema<IPricingConfig>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    version: { type: Number, default: 1 },
    defaultRouteFare: { type: Number, required: true },
    sizeFees: { type: Schema.Types.Mixed, required: true },
    includedKg: { type: Number, required: true },
    perKgFee: { type: Number, required: true },
    serviceMultipliers: { type: Schema.Types.Mixed, required: true },
    fragileFee: { type: Number, required: true },
    insuranceRatePct: { type: Number, required: true },
    minInsuranceFee: { type: Number, required: true },
    roundToNaira: { type: Number, required: true },
    partnerCommissionPct: { type: Number, default: 20 },
    maxActiveJobsPerRider: { type: Number, default: 3 },
    updatedBy: String,
  },
  { timestamps: true },
);

export const PricingConfigModel = model<IPricingConfig>('PricingConfig', pricingConfigSchema);
