import type { FilterQuery, UpdateQuery } from 'mongoose';
import type { ActorType, ShipmentSource, ShipmentStatus } from '@estene/contracts/enums';
import type {
  ConfirmDeliveryInput,
  ConfirmPickupInput,
  NewShipmentInput,
  ShipmentListQuery,
  StopInput,
} from '@estene/contracts/shipment';
import { canTransition, SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { ACTIVE_RIDER_STATUSES } from '@estene/contracts/shipment-status';
import { computeQuote } from '@estene/contracts/pricing';
import { decrypt, encrypt, randomCode, randomPin, safeEqual } from '../../lib/crypto';
import { searchRegex } from '../../lib/db';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { bus } from '../../lib/events';
import { paginate } from '../../lib/response';
import { ClientModel } from '../clients/models/client.model';
import { PricingService } from '../pricing/pricing.service';
import { RiderModel } from '../riders/models/rider.model';
import { ParcelTagModel } from '../tags/models/parcel-tag.model';
import { ZoneModel } from '../zones/models/zone.model';
import { ShipmentModel, type IShipment, type ShipmentDoc } from './models/shipment.model';
import {
  SHIPMENT_POPULATE,
  payableAmount,
  toShipmentDto,
  toPublicTrackingDto,
} from './shipments.mapper';

export type Actor = { type: ActorType | 'system'; id?: string };

export type CreateOptions = { source: ShipmentSource; clientId?: string; clientReference?: string };

const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;

const MAX_PIN_ATTEMPTS = 5;

const toStopDoc = (s: StopInput) => {
  const { zoneId, location, ...rest } = s;
  return {
    ...rest,
    zone: zoneId,
    ...(location && {
      location: { type: 'Point' as const, coordinates: [location.lng, location.lat] },
    }),
  };
};

async function loadShipment(id: string): Promise<ShipmentDoc> {
  const shipment = await ShipmentModel.findById(id).populate(SHIPMENT_POPULATE);
  if (!shipment) throw notFound('Shipment not found');
  return shipment;
}

async function generateTrackingNumber() {
  for (let i = 0; i < 5; i++) {
    const candidate = `EST${randomCode(9)}`;
    if (!(await ShipmentModel.exists({ trackingNumber: candidate }))) return candidate;
  }
  throw new AppError(500, 'Could not allocate a tracking number', 'TRACKING_NUMBER_EXHAUSTED');
}

/**
 * The only way an shipment's status changes. Guards the state machine, then
 * applies the update with a compare-and-set on the current status so two
 * concurrent requests (e.g. two riders accepting) cannot both win.
 */
async function transition(
  shipmentId: string,
  to: ShipmentStatus,
  actor: Actor,
  opts: { note?: string; set?: UpdateQuery<IShipment>; where?: FilterQuery<IShipment> } = {},
) {
  const current = await ShipmentModel.findById(shipmentId, 'status');
  if (!current) throw notFound('Shipment not found');
  const from = current.status;

  const allowed = actor.type === 'system' || canTransition(from, to, actor.type);
  if (!allowed) {
    throw badRequest(
      `Cannot move an shipment from "${SHIPMENT_STATUS_META[from].label}" to "${SHIPMENT_STATUS_META[to].label}"`,
      'INVALID_TRANSITION',
    );
  }

  const updated = await ShipmentModel.findOneAndUpdate(
    { _id: shipmentId, status: from, ...opts.where },
    {
      ...opts.set,
      $set: { ...(opts.set?.$set as object), status: to },
      $push: {
        events: {
          status: to,
          note: opts.note,
          actorType: actor.type,
          actorId: actor.id,
          at: new Date(),
        },
      },
    },
    { new: true },
  ).populate(SHIPMENT_POPULATE);

  if (!updated) throw conflict('This shipment was updated by someone else — refresh and try again');

  bus.emit('shipment.status_changed', { shipmentId, from, to, actorId: actor.id ?? 'system' });
  return updated;
}

async function requireRiderShipment(shipmentId: string, riderId: string) {
  const shipment = await ShipmentModel.findById(shipmentId).select('+pinCipher');
  if (!shipment) throw notFound('Shipment not found');
  if (shipment.rider?.toString() !== riderId) throw forbidden('This job is not assigned to you');
  return shipment;
}

export const ShipmentsService = {
  transition,

  /**
   * Creates an shipment from any channel. With a client + clientReference the
   * call is idempotent: a repeat returns the original shipment (`created: false`),
   * which lets integrators retry safely after a timeout.
   */
  async create(
    input: NewShipmentInput,
    actor: Actor,
    opts: CreateOptions,
  ): Promise<{ shipment: ShipmentDoc; created: boolean }> {
    if (opts.clientId) {
      const client = await ClientModel.exists({ _id: opts.clientId, status: 'active' });
      if (!client) throw badRequest('This business account is not active');
      if (opts.clientReference) {
        const existing = await ShipmentModel.findOne({
          client: opts.clientId,
          clientReference: opts.clientReference,
        }).populate(SHIPMENT_POPULATE);
        if (existing) return { shipment: existing, created: false };
      }
    }

    const zoneIds = [...new Set([input.pickup.zoneId, input.dropoff.zoneId])];
    const zones = await ZoneModel.find({ _id: { $in: zoneIds }, isActive: true }, 'areas');
    if (zones.length !== zoneIds.length) throw badRequest('We do not deliver to that area yet');
    for (const stop of [input.pickup, input.dropoff]) {
      const zone = zones.find((z) => z.id === stop.zoneId);
      if (zone && !zone.areas.includes(stop.area))
        throw badRequest(`"${stop.area}" is not an area we serve in that zone`);
    }

    const quote = await PricingService.quote({
      pickupZoneId: input.pickup.zoneId,
      dropoffZoneId: input.dropoff.zoneId,
      serviceLevel: input.serviceLevel,
      ...input.parcel,
    });

    let shipment: ShipmentDoc;
    try {
      shipment = await ShipmentModel.create({
        trackingNumber: await generateTrackingNumber(),
        source: opts.source,
        client: opts.clientId ?? null,
        clientReference: opts.clientReference,
        pickup: toStopDoc(input.pickup),
        dropoff: toStopDoc(input.dropoff),
        parcel: input.parcel,
        serviceLevel: input.serviceLevel,
        paymentMethod: input.paymentMethod,
        estimate: quote,
        pinCipher: encrypt(randomPin()),
        senderEmail: input.senderEmail,
        notes: input.notes,
        events: [{ status: 'created', actorType: actor.type, actorId: actor.id, at: new Date() }],
      });
    } catch (err) {
      // Two concurrent retries with the same reference: the loser returns the winner's shipment.
      if (isDuplicateKey(err) && opts.clientId && opts.clientReference) {
        const existing = await ShipmentModel.findOne({
          client: opts.clientId,
          clientReference: opts.clientReference,
        }).populate(SHIPMENT_POPULATE);
        if (existing) return { shipment: existing, created: false };
      }
      throw err;
    }

    bus.emit('shipment.created', { shipmentId: shipment.id });
    return { shipment: await loadShipment(shipment.id), created: true };
  },

  /** Phone bookings: the caller's details from their most recent shipment, to save re-typing. */
  async lookupSender(phone: string) {
    const last = await ShipmentModel.findOne({ 'pickup.phone': phone }, 'pickup senderEmail client')
      .sort({ createdAt: -1 })
      .lean();
    if (!last) return null;
    return {
      contactName: last.pickup.contactName,
      zoneId: last.pickup.zone.toString(),
      area: last.pickup.area,
      address: last.pickup.address,
      landmark: last.pickup.landmark,
      senderEmail: last.senderEmail,
      clientId: last.client?.toString(),
    };
  },

  async list(q: ShipmentListQuery) {
    const filter: FilterQuery<IShipment> = {};
    if (q.status) filter.status = q.status;
    if (q.riderId) filter.rider = q.riderId;
    if (q.clientId) filter.client = q.clientId;
    if (q.zoneId) filter.$or = [{ 'pickup.zone': q.zoneId }, { 'dropoff.zone': q.zoneId }];
    if (q.from || q.to)
      filter.createdAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
    if (q.search) {
      const rx = searchRegex(q.search);
      filter.$and = [
        {
          $or: [
            { trackingNumber: rx },
            { 'pickup.contactName': rx },
            { 'dropoff.contactName': rx },
            { 'pickup.phone': rx },
            { 'dropoff.phone': rx },
            { tagCode: rx },
          ],
        },
      ];
    }

    const [shipments, total] = await Promise.all([
      ShipmentModel.find(filter)
        .populate(SHIPMENT_POPULATE)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      ShipmentModel.countDocuments(filter),
    ]);
    return paginate(shipments.map(toShipmentDto), total, q.page, q.limit);
  },

  async get(id: string) {
    return toShipmentDto(await loadShipment(id));
  },

  async track(trackingNumber: string) {
    const shipment = await ShipmentModel.findOne({
      trackingNumber: trackingNumber.toUpperCase(),
    }).populate(SHIPMENT_POPULATE);
    if (!shipment) throw notFound('We could not find a parcel with that tracking number');
    return toPublicTrackingDto(shipment);
  },

  /** Assign (or re-assign) a rider. Used by dispatch when a rider accepts, and by admins manually. */
  async assignRider(shipmentId: string, riderId: string, actor: Actor) {
    const rider = await RiderModel.findOne({ _id: riderId, status: 'active' }, '_id');
    if (!rider) throw badRequest('Rider is not active');

    const shipment = await transition(shipmentId, 'assigned', actor, {
      where: { rider: null },
      set: { $set: { rider: riderId, assignedAt: new Date(), 'dispatch.state': 'assigned' } },
    });
    return toShipmentDto(shipment);
  },

  async unassignRider(shipmentId: string, actor: Actor, note?: string) {
    const shipment = await transition(shipmentId, 'created', actor, {
      note,
      set: { $set: { rider: null, 'dispatch.state': 'searching' } },
    });
    bus.emit('dispatch.requested', { shipmentId });
    return toShipmentDto(shipment);
  },

  async startPickup(shipmentId: string, riderId: string) {
    await requireRiderShipment(shipmentId, riderId);
    return toShipmentDto(
      await transition(shipmentId, 'en_route_to_pickup', { type: 'rider', id: riderId }),
    );
  },

  /**
   * Rider at pickup: binds a QR tag and confirms the parcel. If what they see
   * differs from what was booked, the price is recomputed with the same
   * pricing config and the difference is recorded with a reason.
   */
  async confirmPickup(shipmentId: string, riderId: string, input: ConfirmPickupInput) {
    const shipment = await requireRiderShipment(shipmentId, riderId);
    if (shipment.status === 'assigned')
      await transition(shipmentId, 'en_route_to_pickup', { type: 'rider', id: riderId });

    const config = await PricingService.getConfig();
    const confirmed = computeQuote(
      {
        routeFare: shipment.estimate.routeFare,
        size: input.size,
        weightKg: input.weightKg,
        serviceLevel: shipment.serviceLevel,
        fragile: shipment.parcel.fragile,
        declaredValue: shipment.parcel.declaredValue,
      },
      config,
    );
    const priceChanged = confirmed.total !== shipment.estimate.total;
    if (priceChanged && !input.adjustmentReason) {
      throw badRequest(
        'The parcel differs from the booking — add a reason for the price change',
        'ADJUSTMENT_REASON_REQUIRED',
      );
    }

    const tag = await ParcelTagModel.findOneAndUpdate(
      { code: input.tagCode, status: 'available' },
      { status: 'bound', shipment: shipment._id, boundAt: new Date() },
      { new: true },
    );
    if (!tag)
      throw badRequest('This tag is invalid or already used. Scan a fresh tag.', 'INVALID_TAG');

    try {
      const updated = await transition(
        shipmentId,
        'picked_up',
        { type: 'rider', id: riderId },
        {
          note: priceChanged ? `Price adjusted: ${input.adjustmentReason}` : undefined,
          set: {
            $set: {
              tagCode: tag.code,
              finalAmount: confirmed.total,
              'parcel.size': input.size,
              'parcel.weightKg': input.weightKg,
              ...(input.description && { 'parcel.description': input.description }),
              ...(priceChanged && {
                adjustment: {
                  from: shipment.estimate.total,
                  to: confirmed.total,
                  reason: input.adjustmentReason,
                  at: new Date(),
                  by: riderId,
                },
              }),
              ...(shipment.paymentMethod === 'cash_on_pickup' && { paymentStatus: 'paid' }),
            },
          },
        },
      );
      if (priceChanged) {
        bus.emit('shipment.price_adjusted', {
          shipmentId,
          from: shipment.estimate.total,
          to: confirmed.total,
          reason: input.adjustmentReason,
        });
      }
      return toShipmentDto(updated);
    } catch (err) {
      // Release the tag so the rider can retry with it.
      await ParcelTagModel.updateOne(
        { _id: tag._id },
        { status: 'available', $unset: { shipment: 1, boundAt: 1 } },
      );
      throw err;
    }
  },

  async advance(shipmentId: string, riderId: string, to: ShipmentStatus, note?: string) {
    await requireRiderShipment(shipmentId, riderId);
    if (to === 'picked_up' || to === 'delivered')
      throw badRequest('Use the scan flow for this step');
    return toShipmentDto(
      await transition(shipmentId, to, { type: 'rider', id: riderId }, { note }),
    );
  },

  /** Rider at drop-off: rescans the tag, then proves delivery with the recipient's PIN or a photo. */
  async confirmDelivery(shipmentId: string, riderId: string, input: ConfirmDeliveryInput) {
    const shipment = await requireRiderShipment(shipmentId, riderId);
    if (shipment.tagCode !== input.tagCode)
      throw badRequest('Tag does not match this parcel', 'TAG_MISMATCH');

    if (input.method === 'pin') {
      if (shipment.pinAttempts >= MAX_PIN_ATTEMPTS) {
        throw badRequest('Too many wrong PINs — take a delivery photo instead', 'PIN_LOCKED');
      }
      if (!safeEqual(decrypt(shipment.pinCipher), input.pin ?? '')) {
        await ShipmentModel.updateOne({ _id: shipmentId }, { $inc: { pinAttempts: 1 } });
        throw badRequest('Incorrect PIN', 'WRONG_PIN');
      }
    }

    const updated = await transition(
      shipmentId,
      'delivered',
      { type: 'rider', id: riderId },
      {
        set: {
          $set: {
            deliveredAt: new Date(),
            proof: {
              method: input.method,
              photoUrl: input.photoUrl,
              receivedBy: input.receivedBy,
              at: new Date(),
            },
            ...(shipment.paymentMethod === 'cash_on_delivery' && { paymentStatus: 'paid' }),
          },
        },
      },
    );
    return toShipmentDto(updated);
  },

  async cancel(shipmentId: string, actor: Actor, reason?: string) {
    return toShipmentDto(
      await transition(shipmentId, 'cancelled', actor, {
        note: reason,
        set: { $set: { 'dispatch.state': 'unassigned' } },
      }),
    );
  },

  async markPaid(shipmentId: string) {
    const shipment = await ShipmentModel.findOneAndUpdate(
      { _id: shipmentId, paymentStatus: 'unpaid' },
      { paymentStatus: 'paid' },
      { new: true },
    ).populate(SHIPMENT_POPULATE);
    if (!shipment) throw badRequest('Shipment is already paid or does not exist');
    bus.emit('shipment.paid', { shipmentId });
    return toShipmentDto(shipment);
  },

  async riderJobs(riderId: string) {
    const shipments = await ShipmentModel.find({
      rider: riderId,
      status: { $in: ACTIVE_RIDER_STATUSES },
    })
      .populate(SHIPMENT_POPULATE)
      .sort({ assignedAt: 1 });
    return shipments.map(toShipmentDto);
  },

  /** Plaintext PIN — only ever handed to the notification layer, never to an HTTP response. */
  async deliveryPin(shipmentId: string) {
    const shipment = await ShipmentModel.findById(shipmentId).select('+pinCipher');
    return shipment ? decrypt(shipment.pinCipher) : null;
  },

  payableAmount,
};
