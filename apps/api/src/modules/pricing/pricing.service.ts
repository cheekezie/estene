import { z } from 'zod';
import {
  computeQuote,
  DEFAULT_PRICING_CONFIG,
  PricingConfigSchema,
  type RouteRateInput,
} from '@estene/contracts/pricing';
import type { QuoteRequest } from '@estene/contracts/shipment';
import { badRequest, notFound } from '../../lib/errors';
import { ZoneModel } from '../zones/models/zone.model';
import { PricingConfigModel, type IPricingConfig } from './models/pricing-config.model';
import { orderedPair, RouteRateModel } from './models/route-rate.model';

export const PlatformSettingsSchema = PricingConfigSchema.extend({
  partnerCommissionPct: z.number().min(0).max(100),
  maxActiveJobsPerRider: z.number().int().min(1).max(20),
});
export type PlatformSettings = z.infer<typeof PlatformSettingsSchema>;

// Pricing is read on every quote but changes rarely — a short in-process
// cache keeps it off the hot path. Invalidated on update in this instance;
// other instances pick the change up within the TTL.
const CACHE_TTL_MS = 30_000;
let cache: { value: IPricingConfig; at: number } | null = null;

export const PricingService = {
  async getConfig(): Promise<IPricingConfig> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
    const doc =
      (await PricingConfigModel.findOne({ key: 'default' }).lean()) ??
      (await PricingConfigModel.create({ key: 'default', ...DEFAULT_PRICING_CONFIG })).toObject();
    cache = { value: doc, at: Date.now() };
    return doc;
  },

  async updateConfig(input: PlatformSettings, adminId: string) {
    const doc = await PricingConfigModel.findOneAndUpdate(
      { key: 'default' },
      { ...input, updatedBy: adminId, $inc: { version: 1 } },
      { new: true, upsert: true },
    ).lean();
    cache = null;
    return doc;
  },

  async resolveRouteFare(pickupZoneId: string, dropoffZoneId: string) {
    if (pickupZoneId === dropoffZoneId) {
      const zone = await ZoneModel.findOne({ _id: pickupZoneId, isActive: true });
      if (!zone) throw badRequest('We do not deliver to that area yet');
      return zone.intraZoneFare;
    }
    const zones = await ZoneModel.countDocuments({
      _id: { $in: [pickupZoneId, dropoffZoneId] },
      isActive: true,
    });
    if (zones !== 2) throw badRequest('We do not deliver to that area yet');

    const rate = await RouteRateModel.findOne(orderedPair(pickupZoneId, dropoffZoneId)).lean();
    return rate?.fare ?? (await this.getConfig()).defaultRouteFare;
  },

  async quote(req: QuoteRequest) {
    const [config, routeFare] = await Promise.all([
      this.getConfig(),
      this.resolveRouteFare(req.pickupZoneId, req.dropoffZoneId),
    ]);
    const quote = computeQuote({ ...req, routeFare }, config);
    return { ...quote, routeFare, pricingVersion: config.version };
  },

  async listRouteRates() {
    const rates = await RouteRateModel.find()
      .populate<{
        zoneA: { _id: string; name: string; code: string };
        zoneB: { _id: string; name: string; code: string };
      }>('zoneA zoneB', 'name code')
      .lean();
    return rates.map((r) => ({
      id: r._id.toString(),
      zoneA: { id: r.zoneA._id.toString(), name: r.zoneA.name, code: r.zoneA.code },
      zoneB: { id: r.zoneB._id.toString(), name: r.zoneB.name, code: r.zoneB.code },
      fare: r.fare,
    }));
  },

  async upsertRouteRate(input: RouteRateInput) {
    if (input.originZoneId === input.destinationZoneId) {
      throw badRequest('Same-zone trips use the zone’s intra-zone fare');
    }
    const pair = orderedPair(input.originZoneId, input.destinationZoneId);
    await RouteRateModel.updateOne(pair, { fare: input.fare }, { upsert: true });
  },

  async deleteRouteRate(id: string) {
    const res = await RouteRateModel.deleteOne({ _id: id });
    if (!res.deletedCount) throw notFound('Route rate not found');
  },
};
