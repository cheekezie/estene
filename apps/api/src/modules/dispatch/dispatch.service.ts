import { ShipmentModel } from '../shipments/models/shipment.model';
import { ShipmentsService } from '../shipments/shipments.service';
import { toShipmentDto, SHIPMENT_POPULATE } from '../shipments/shipments.mapper';
import { PricingService } from '../pricing/pricing.service';
import { RiderModel } from '../riders/models/rider.model';
import { PresenceService } from '../riders/presence.service';
import { activeJobCounts } from '../riders/riders.service';
import { ZoneModel } from '../zones/models/zone.model';
import { bus } from '../../lib/events';
import { conflict } from '../../lib/errors';
import { getQueue } from '../../lib/queue';
import { DispatchOfferModel } from './models/dispatch-offer.model';
import { rankCandidates } from './dispatch.ranking';

export const DISPATCH_QUEUE = 'dispatch';
const OFFER_TTL_MS = 45_000;
/** Search a little beyond the zone edge — a rider just across the boundary is still close. */
const SEARCH_BUFFER_KM = 3;
const RETRY_DELAY_MS = 60_000;
/** ~15 minutes of retries, then the shipment is flagged for manual assignment. */
const MAX_ATTEMPTS = 15;

const queue = () => getQueue(DISPATCH_QUEUE);

export const DispatchService = {
  /** Finds the best available rider and sends them a time-boxed offer. Safe to call repeatedly. */
  async dispatchShipment(shipmentId: string) {
    const shipment = await ShipmentModel.findById(shipmentId);
    if (!shipment || shipment.status !== 'created' || shipment.rider) return;
    if (await DispatchOfferModel.exists({ shipment: shipmentId, status: 'pending' })) return;

    const zone = await ZoneModel.findById(shipment.pickup.zone);
    if (!zone) return;
    const [lng, lat] = shipment.pickup.location?.coordinates ?? zone.center.coordinates;

    const nearby = await PresenceService.nearby({ lng, lat }, zone.radiusKm + SEARCH_BUFFER_KM);
    const excluded = new Set(shipment.dispatch.declinedBy.map(String));
    const eligible = nearby.filter((n) => !excluded.has(n.riderId));

    const riders = await RiderModel.find(
      { _id: { $in: eligible.map((n) => n.riderId) }, status: 'active' },
      'primaryZone coverageZones',
    ).lean();
    const [jobs, config] = await Promise.all([
      activeJobCounts(riders.map((r) => r._id)),
      PricingService.getConfig(),
    ]);
    const distance = new Map(eligible.map((n) => [n.riderId, n.distanceKm]));

    const [best] = rankCandidates(
      riders.map((r) => ({
        riderId: r._id.toString(),
        primaryZone: r.primaryZone,
        coverageZones: r.coverageZones,
        distanceKm: distance.get(r._id.toString()) ?? Infinity,
        activeJobs: jobs.get(r._id.toString()) ?? 0,
      })),
      zone._id.toString(),
      config.maxActiveJobsPerRider,
    );

    if (!best) {
      const attempts = shipment.dispatch.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await ShipmentModel.updateOne(
        { _id: shipmentId },
        { 'dispatch.attempts': attempts, 'dispatch.state': exhausted ? 'unassigned' : 'searching' },
      );
      if (!exhausted)
        await queue().add('dispatch-shipment', { shipmentId }, { delay: RETRY_DELAY_MS });
      return;
    }

    const expiresAt = new Date(Date.now() + OFFER_TTL_MS);
    const offer = await DispatchOfferModel.create({
      shipment: shipmentId,
      rider: best.riderId,
      rank: { tier: best.tier, distanceKm: best.distanceKm, activeJobs: best.activeJobs },
      expiresAt,
    }).catch(() => null); // lost a race with a concurrent dispatch — the other offer stands
    if (!offer) return;

    await ShipmentModel.updateOne(
      { _id: shipmentId },
      { 'dispatch.state': 'offered', $inc: { 'dispatch.attempts': 1 } },
    );
    await queue().add('offer-timeout', { offerId: offer.id }, { delay: OFFER_TTL_MS });
    bus.emit('dispatch.offered', {
      shipmentId,
      riderId: best.riderId,
      offerId: offer.id,
      expiresAt,
    });
  },

  async respond(offerId: string, riderId: string, accept: boolean) {
    const offer = await DispatchOfferModel.findOneAndUpdate(
      { _id: offerId, rider: riderId, status: 'pending', expiresAt: { $gt: new Date() } },
      { status: accept ? 'accepted' : 'declined', respondedAt: new Date() },
      { new: true },
    );
    if (!offer) throw conflict('This offer has expired', 'OFFER_EXPIRED');
    const shipmentId = offer.shipment.toString();

    if (!accept) {
      await this.moveOn(shipmentId, riderId);
      return null;
    }

    try {
      return await ShipmentsService.assignRider(shipmentId, riderId, {
        type: 'rider',
        id: riderId,
      });
    } catch (err) {
      await DispatchOfferModel.updateOne({ _id: offerId }, { status: 'withdrawn' });
      throw err;
    }
  },

  async expireOffer(offerId: string) {
    const offer = await DispatchOfferModel.findOneAndUpdate(
      { _id: offerId, status: 'pending' },
      { status: 'expired' },
    );
    if (offer) await this.moveOn(offer.shipment.toString(), offer.rider.toString());
  },

  /** Rules a rider out for this shipment and offers it to the next one. */
  async moveOn(shipmentId: string, riderId: string) {
    await ShipmentModel.updateOne(
      { _id: shipmentId },
      { $addToSet: { 'dispatch.declinedBy': riderId }, 'dispatch.state': 'searching' },
    );
    await queue().add('dispatch-shipment', { shipmentId });
  },

  async withdrawOffers(shipmentId: string) {
    await DispatchOfferModel.updateMany(
      { shipment: shipmentId, status: 'pending' },
      { status: 'withdrawn' },
    );
  },

  async pendingOffersFor(riderId: string) {
    const offers = await DispatchOfferModel.find({
      rider: riderId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).lean();
    const shipments = await ShipmentModel.find({
      _id: { $in: offers.map((o) => o.shipment) },
    }).populate(SHIPMENT_POPULATE);
    const byId = new Map(shipments.map((o) => [o.id, toShipmentDto(o)]));
    return offers.flatMap((o) => {
      const shipment = byId.get(o.shipment.toString());
      return shipment
        ? [
            {
              offerId: o._id.toString(),
              expiresAt: o.expiresAt.toISOString(),
              distanceKm: o.rank.distanceKm,
              shipment,
            },
          ]
        : [];
    });
  },
};
