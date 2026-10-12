import type { FilterQuery, UpdateQuery } from 'mongoose';
import type { ActorType, OrderSource, OrderStatus } from '@estene/contracts/enums';
import type {
  ConfirmDeliveryInput,
  ConfirmPickupInput,
  NewOrderInput,
  OrderListQuery,
  StopInput,
} from '@estene/contracts/order';
import { canTransition, ORDER_STATUS_META } from '@estene/contracts/order-status';
import { ACTIVE_RIDER_STATUSES } from '@estene/contracts/order-status';
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
import { OrderModel, type IOrder, type OrderDoc } from './models/order.model';
import { ORDER_POPULATE, payableAmount, toOrderDto, toPublicTrackingDto } from './orders.mapper';

export type Actor = { type: ActorType | 'system'; id?: string };

export type CreateOptions = { source: OrderSource; clientId?: string; externalReference?: string };

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

async function loadOrder(id: string): Promise<OrderDoc> {
  const order = await OrderModel.findById(id).populate(ORDER_POPULATE);
  if (!order) throw notFound('Order not found');
  return order;
}

async function generateTrackingNumber() {
  for (let i = 0; i < 5; i++) {
    const candidate = `EST${randomCode(9)}`;
    if (!(await OrderModel.exists({ trackingNumber: candidate }))) return candidate;
  }
  throw new AppError(500, 'Could not allocate a tracking number', 'TRACKING_NUMBER_EXHAUSTED');
}

/**
 * The only way an order's status changes. Guards the state machine, then
 * applies the update with a compare-and-set on the current status so two
 * concurrent requests (e.g. two riders accepting) cannot both win.
 */
async function transition(
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  opts: { note?: string; set?: UpdateQuery<IOrder>; where?: FilterQuery<IOrder> } = {},
) {
  const current = await OrderModel.findById(orderId, 'status');
  if (!current) throw notFound('Order not found');
  const from = current.status;

  const allowed = actor.type === 'system' || canTransition(from, to, actor.type);
  if (!allowed) {
    throw badRequest(
      `Cannot move an order from "${ORDER_STATUS_META[from].label}" to "${ORDER_STATUS_META[to].label}"`,
      'INVALID_TRANSITION',
    );
  }

  const updated = await OrderModel.findOneAndUpdate(
    { _id: orderId, status: from, ...opts.where },
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
  ).populate(ORDER_POPULATE);

  if (!updated) throw conflict('This order was updated by someone else — refresh and try again');

  bus.emit('order.status_changed', { orderId, from, to, actorId: actor.id ?? 'system' });
  return updated;
}

async function requireRiderOrder(orderId: string, riderId: string) {
  const order = await OrderModel.findById(orderId).select('+pinCipher');
  if (!order) throw notFound('Order not found');
  if (order.rider?.toString() !== riderId) throw forbidden('This job is not assigned to you');
  return order;
}

export const OrdersService = {
  transition,

  /**
   * Creates an order from any channel. With a client + externalReference the
   * call is idempotent: a repeat returns the original order (`created: false`),
   * which lets integrators retry safely after a timeout.
   */
  async create(
    input: NewOrderInput,
    actor: Actor,
    opts: CreateOptions,
  ): Promise<{ order: OrderDoc; created: boolean }> {
    if (opts.clientId) {
      const client = await ClientModel.exists({ _id: opts.clientId, status: 'active' });
      if (!client) throw badRequest('This business account is not active');
      if (opts.externalReference) {
        const existing = await OrderModel.findOne({
          client: opts.clientId,
          externalReference: opts.externalReference,
        }).populate(ORDER_POPULATE);
        if (existing) return { order: existing, created: false };
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

    let order: OrderDoc;
    try {
      order = await OrderModel.create({
        trackingNumber: await generateTrackingNumber(),
        source: opts.source,
        client: opts.clientId ?? null,
        externalReference: opts.externalReference,
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
      // Two concurrent retries with the same reference: the loser returns the winner's order.
      if (isDuplicateKey(err) && opts.clientId && opts.externalReference) {
        const existing = await OrderModel.findOne({
          client: opts.clientId,
          externalReference: opts.externalReference,
        }).populate(ORDER_POPULATE);
        if (existing) return { order: existing, created: false };
      }
      throw err;
    }

    bus.emit('order.created', { orderId: order.id });
    return { order: await loadOrder(order.id), created: true };
  },

  /** Phone bookings: the caller's details from their most recent order, to save re-typing. */
  async lookupSender(phone: string) {
    const last = await OrderModel.findOne({ 'pickup.phone': phone }, 'pickup senderEmail client')
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

  async list(q: OrderListQuery) {
    const filter: FilterQuery<IOrder> = {};
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

    const [orders, total] = await Promise.all([
      OrderModel.find(filter)
        .populate(ORDER_POPULATE)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      OrderModel.countDocuments(filter),
    ]);
    return paginate(orders.map(toOrderDto), total, q.page, q.limit);
  },

  async get(id: string) {
    return toOrderDto(await loadOrder(id));
  },

  async track(trackingNumber: string) {
    const order = await OrderModel.findOne({
      trackingNumber: trackingNumber.toUpperCase(),
    }).populate(ORDER_POPULATE);
    if (!order) throw notFound('We could not find a parcel with that tracking number');
    return toPublicTrackingDto(order);
  },

  /** Assign (or re-assign) a rider. Used by dispatch when a rider accepts, and by admins manually. */
  async assignRider(orderId: string, riderId: string, actor: Actor) {
    const rider = await RiderModel.findOne({ _id: riderId, status: 'active' }, '_id');
    if (!rider) throw badRequest('Rider is not active');

    const order = await transition(orderId, 'assigned', actor, {
      where: { rider: null },
      set: { $set: { rider: riderId, assignedAt: new Date(), 'dispatch.state': 'assigned' } },
    });
    return toOrderDto(order);
  },

  async unassignRider(orderId: string, actor: Actor, note?: string) {
    const order = await transition(orderId, 'created', actor, {
      note,
      set: { $set: { rider: null, 'dispatch.state': 'searching' } },
    });
    bus.emit('dispatch.requested', { orderId });
    return toOrderDto(order);
  },

  async startPickup(orderId: string, riderId: string) {
    await requireRiderOrder(orderId, riderId);
    return toOrderDto(
      await transition(orderId, 'en_route_to_pickup', { type: 'rider', id: riderId }),
    );
  },

  /**
   * Rider at pickup: binds a QR tag and confirms the parcel. If what they see
   * differs from what was booked, the price is recomputed with the same
   * pricing config and the difference is recorded with a reason.
   */
  async confirmPickup(orderId: string, riderId: string, input: ConfirmPickupInput) {
    const order = await requireRiderOrder(orderId, riderId);
    if (order.status === 'assigned')
      await transition(orderId, 'en_route_to_pickup', { type: 'rider', id: riderId });

    const config = await PricingService.getConfig();
    const confirmed = computeQuote(
      {
        routeFare: order.estimate.routeFare,
        size: input.size,
        weightKg: input.weightKg,
        serviceLevel: order.serviceLevel,
        fragile: order.parcel.fragile,
        declaredValue: order.parcel.declaredValue,
      },
      config,
    );
    const priceChanged = confirmed.total !== order.estimate.total;
    if (priceChanged && !input.adjustmentReason) {
      throw badRequest(
        'The parcel differs from the booking — add a reason for the price change',
        'ADJUSTMENT_REASON_REQUIRED',
      );
    }

    const tag = await ParcelTagModel.findOneAndUpdate(
      { code: input.tagCode, status: 'available' },
      { status: 'bound', order: order._id, boundAt: new Date() },
      { new: true },
    );
    if (!tag)
      throw badRequest('This tag is invalid or already used. Scan a fresh tag.', 'INVALID_TAG');

    try {
      const updated = await transition(
        orderId,
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
                  from: order.estimate.total,
                  to: confirmed.total,
                  reason: input.adjustmentReason,
                  at: new Date(),
                  by: riderId,
                },
              }),
              ...(order.paymentMethod === 'cash_on_pickup' && { paymentStatus: 'paid' }),
            },
          },
        },
      );
      if (priceChanged) {
        bus.emit('order.price_adjusted', {
          orderId,
          from: order.estimate.total,
          to: confirmed.total,
          reason: input.adjustmentReason,
        });
      }
      return toOrderDto(updated);
    } catch (err) {
      // Release the tag so the rider can retry with it.
      await ParcelTagModel.updateOne(
        { _id: tag._id },
        { status: 'available', $unset: { order: 1, boundAt: 1 } },
      );
      throw err;
    }
  },

  async advance(orderId: string, riderId: string, to: OrderStatus, note?: string) {
    await requireRiderOrder(orderId, riderId);
    if (to === 'picked_up' || to === 'delivered')
      throw badRequest('Use the scan flow for this step');
    return toOrderDto(await transition(orderId, to, { type: 'rider', id: riderId }, { note }));
  },

  /** Rider at drop-off: rescans the tag, then proves delivery with the recipient's PIN or a photo. */
  async confirmDelivery(orderId: string, riderId: string, input: ConfirmDeliveryInput) {
    const order = await requireRiderOrder(orderId, riderId);
    if (order.tagCode !== input.tagCode)
      throw badRequest('Tag does not match this parcel', 'TAG_MISMATCH');

    if (input.method === 'pin') {
      if (order.pinAttempts >= MAX_PIN_ATTEMPTS) {
        throw badRequest('Too many wrong PINs — take a delivery photo instead', 'PIN_LOCKED');
      }
      if (!safeEqual(decrypt(order.pinCipher), input.pin ?? '')) {
        await OrderModel.updateOne({ _id: orderId }, { $inc: { pinAttempts: 1 } });
        throw badRequest('Incorrect PIN', 'WRONG_PIN');
      }
    }

    const updated = await transition(
      orderId,
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
            ...(order.paymentMethod === 'cash_on_delivery' && { paymentStatus: 'paid' }),
          },
        },
      },
    );
    return toOrderDto(updated);
  },

  async cancel(orderId: string, actor: Actor, reason?: string) {
    return toOrderDto(
      await transition(orderId, 'cancelled', actor, {
        note: reason,
        set: { $set: { 'dispatch.state': 'unassigned' } },
      }),
    );
  },

  async markPaid(orderId: string) {
    const order = await OrderModel.findOneAndUpdate(
      { _id: orderId, paymentStatus: 'unpaid' },
      { paymentStatus: 'paid' },
      { new: true },
    ).populate(ORDER_POPULATE);
    if (!order) throw badRequest('Order is already paid or does not exist');
    bus.emit('order.paid', { orderId });
    return toOrderDto(order);
  },

  async riderJobs(riderId: string) {
    const orders = await OrderModel.find({ rider: riderId, status: { $in: ACTIVE_RIDER_STATUSES } })
      .populate(ORDER_POPULATE)
      .sort({ assignedAt: 1 });
    return orders.map(toOrderDto);
  },

  /** Plaintext PIN — only ever handed to the notification layer, never to an HTTP response. */
  async deliveryPin(orderId: string) {
    const order = await OrderModel.findById(orderId).select('+pinCipher');
    return order ? decrypt(order.pinCipher) : null;
  },

  payableAmount,
};
