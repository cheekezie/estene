import { Schema, model } from 'mongoose';
import { DEFAULT_HANDLING_FEE, type HandlingFeeSettings } from '@estene/contracts/handling-fee';
import type { PricingConfig } from '@estene/contracts/pricing';

/**
 * Singleton (key = "default"). Every save bumps `version`; shipments store the
 * version they were priced with, so old quotes stay explainable after edits.
 */
export interface IPricingConfig extends PricingConfig, HandlingFeeSettings {
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
    interstateFare: { type: Number, default: 450_000 },
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
    // Warehousing handling fee: price per block of units, per billing cycle.
    handlingUnitsPerBlock: { type: Number, default: DEFAULT_HANDLING_FEE.handlingUnitsPerBlock },
    handlingFeePerBlock: { type: Number, default: DEFAULT_HANDLING_FEE.handlingFeePerBlock },
    handlingFeeDueDays: { type: Number, default: DEFAULT_HANDLING_FEE.handlingFeeDueDays },
    updatedBy: String,
  },
  { timestamps: true },
);

export const PricingConfigModel = model<IPricingConfig>('PricingConfig', pricingConfigSchema);
