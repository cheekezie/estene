import { Types, type FilterQuery, type UpdateQuery } from 'mongoose';
import type { ShipmentStatus } from '@estene/contracts/enums';
import {
  CANCELLABLE_ORDER_STATUSES,
  ORDER_STATUS_META,
  orderStatusForShipment,
  type OrderCreateInput,
  type OrderListQuery,
  type OrderPackInput,
  type OrderRestockInput,
  type OrderSource,
  type OrderStatus,
} from '@estene/contracts/warehouse';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { bus } from '../../lib/events';
import { searchRegex } from '../../lib/db';
import { paginate } from '../../lib/response';
import { OfficeModel } from '../offices/models/office.model';
import { OfficeOpsService } from '../office-ops/office-ops.service';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { ShipmentsService, type Actor } from '../shipments/shipments.service';
import { ParcelTagModel } from '../tags/models/parcel-tag.model';
import { ZoneModel } from '../zones/models/zone.model';
import { OrderModel, type IOrder, type OrderDoc } from './models/order.model';
import { ProductModel } from './models/product.model';
import { StockLevelModel } from './models/stock-level.model';
import { StockService, type StockActor } from './stock.service';
import { ORDER_POPULATE, toOrderDto } from './warehousing.mapper';
import { generateNumber, resolveLines, warehousingClient } from './warehousing.service';

const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;
const stockActor = (a: Actor): StockActor =>
  a.type === 'admin' || a.type === 'client' ? { type: a.type, id: a.id } : { type: 'system' };
const linesOf = (o: Pick<IOrder, 'lines'>) =>
  o.lines.map((l) => ({ product: l.product, qty: l.qty }));
const event = (status: OrderStatus, actor: Actor, note?: string) => ({
  status,
  note,
  actorType: actor.type,
  actorId: actor.id,
  at: new Date(),
});

async function load(filter: FilterQuery<IOrder>) {
  const order = await OrderModel.findOne(filter).populate(ORDER_POPULATE);
  if (!order) throw notFound('Order not found');
  return order;
}

/** The order with each line's shelf bin, for the pick list. */
async function withBins(order: OrderDoc) {
  const levels = await StockLevelModel.find(
    {
      office: order.office._id ?? order.office,
      product: { $in: order.lines.map((l) => l.product._id ?? l.product) },
    },
    'product bin',
  ).lean();
  return toOrderDto(order, new Map(levels.map((l) => [l.product.toString(), l.bin ?? null])));
}

/**
 * The only way an order's status changes: compare-and-set on the statuses it
 * may come from, with a timeline event. Returns null when someone else got there first.
 */
async function move(
  id: Types.ObjectId | string,
  from: readonly OrderStatus[],
  to: OrderStatus,
  actor: Actor,
  opts: { note?: string; set?: UpdateQuery<IOrder>['$set']; where?: FilterQuery<IOrder> } = {},
) {
  const before = await OrderModel.findOneAndUpdate(
    { _id: id, status: { $in: from }, ...opts.where },
    { $set: { ...opts.set, status: to }, $push: { events: event(to, actor, opts.note) } },
    { new: false },
  );
  if (before) bus.emit('order.status_changed', { orderId: String(id), from: before.status, to });
  return before;
}

/** Zone/area and collection office are checked when the order arrives, not when it's packed days later. */
async function assertDeliverable(input: OrderCreateInput) {
  if (input.deliveryMode === 'collection') {
    const ok = await OfficeModel.exists({ _id: input.destinationOfficeId, isActive: true });
    if (!ok) throw badRequest('Choose an open Estene office to collect from');
    return;
  }
  const zone = await ZoneModel.findOne(
    { _id: input.recipient.zoneId, isActive: true },
    'areas',
  ).lean();
  if (!zone) throw badRequest('We do not deliver to that area yet');
  if (!zone.areas.includes(input.recipient.area!))
    throw badRequest(`"${input.recipient.area}" is not an area we serve in that zone`);
}

export const OrdersService = {
  /**
   * Takes an order from any channel. With a reference the call is idempotent.
   * Stock is reserved up front; if any line is short the order waits as
   * `awaiting_stock` and is retried when stock arrives.
   */
  async create(
    clientId: string,
    input: OrderCreateInput,
    actor: Actor,
    source: OrderSource,
  ): Promise<{ order: OrderDoc; created: boolean }> {
    const client = await warehousingClient(clientId);
    if (input.reference) {
      const existing = await OrderModel.findOne({ client: clientId, reference: input.reference });
      if (existing) return { order: await load({ _id: existing._id }), created: false };
    }
    await assertDeliverable(input);
    const lines = await resolveLines(clientId, input.lines, (l) => l.qty);
    const office = client.warehousing.office;
    const stockLines = lines.map((l) => ({ product: l.product._id, qty: l.qty }));
    const reserved = await StockService.reserve(office, stockLines);
    const status: OrderStatus = reserved ? 'ready_to_pick' : 'awaiting_stock';

    let order: OrderDoc;
    try {
      order = await OrderModel.create({
        client: clientId,
        office,
        number: await generateNumber('ORD'),
        reference: input.reference,
        source,
        status,
        recipient: {
          contactName: input.recipient.contactName,
          phone: input.recipient.phone,
          ...(input.deliveryMode === 'door' && {
            zone: input.recipient.zoneId,
            area: input.recipient.area,
            address: input.recipient.address,
            landmark: input.recipient.landmark,
          }),
        },
        deliveryMode: input.deliveryMode,
        destinationOffice: input.deliveryMode === 'collection' ? input.destinationOfficeId : null,
        serviceLevel: input.serviceLevel,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        lines: lines.map((l) => ({
          product: l.product._id,
          sku: l.product.sku,
          name: l.product.name,
          qty: l.qty,
        })),
        events: [
          event(
            status,
            actor,
            reserved ? undefined : 'Not enough stock yet — will reserve when it arrives',
          ),
        ],
      });
    } catch (err) {
      if (reserved) await StockService.release(office, stockLines, { emit: false });
      if (isDuplicateKey(err) && input.reference) {
        const existing = await OrderModel.findOne({ client: clientId, reference: input.reference });
        if (existing) return { order: await load({ _id: existing._id }), created: false };
      }
      throw err;
    }
    bus.emit('order.created', { orderId: order.id });
    return { order: await load({ _id: order._id }), created: true };
  },

  async list(q: OrderListQuery & { reference?: string }) {
    const filter: FilterQuery<IOrder> = {};
    if (q.clientId) filter.client = q.clientId;
    if (q.reference) filter.reference = q.reference;
    if (q.officeId) filter.office = q.officeId;
    if (q.status) filter.status = q.status;
    if (q.search) {
      const rx = searchRegex(q.search);
      filter.$or = [
        { number: rx },
        { reference: rx },
        { 'recipient.contactName': rx },
        { 'recipient.phone': rx },
      ];
    }
    // The warehouse works oldest-first; finished orders read newest-first.
    const open = q.status && ['awaiting_stock', 'ready_to_pick', 'picking'].includes(q.status);
    const [rows, total] = await Promise.all([
      OrderModel.find(filter)
        .populate(ORDER_POPULATE)
        .sort({ createdAt: open ? 1 : -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      OrderModel.countDocuments(filter),
    ]);
    return paginate(rows, total, q.page, q.limit);
  },

  /** By our id, our ORD- number or the client's reference. Scoped to a client when given. */
  async find(ref: string, clientId?: string) {
    const or: FilterQuery<IOrder>[] = [{ number: ref.toUpperCase() }, { reference: ref }];
    if (/^[a-f\d]{24}$/i.test(ref)) or.push({ _id: ref });
    return load({ ...(clientId && { client: clientId }), $or: or });
  },

  async detail(id: string) {
    return withBins(await load({ _id: id }));
  },

  /** Staff start collecting the items; the pick list shows each line's bin. */
  async startPicking(id: string, actor: Actor & { officeId?: string }) {
    const order = await load({ _id: id });
    assertOffice(order, actor.officeId);
    if (!(await move(id, ['ready_to_pick'], 'picking', actor)))
      throw conflict('Only an order that is ready to pick can be started');
    return this.detail(id);
  },

  /**
   * Packs the order into a shipment from the warehouse office and accepts it
   * at the counter (tag + weight) in one step. The order is claimed first, so
   * two packers can't ship it twice; if the hand-over fails, everything is undone.
   */
  async pack(id: string, input: OrderPackInput, actor: Actor & { officeId?: string }) {
    const order = await load({ _id: id });
    assertOffice(order, actor.officeId);
    if (!(await ParcelTagModel.exists({ code: input.tagCode, status: 'available' })))
      throw badRequest('This tag is invalid or already used. Scan a fresh tag.', 'INVALID_TAG');

    const claimed = await OrderModel.findOneAndUpdate(
      { _id: id, status: { $in: ['ready_to_pick', 'picking'] } },
      { $set: { status: 'shipped' } },
    );
    if (!claimed)
      throw conflict('This order can’t be packed right now — refresh and check its status');
    const previous = claimed.status;

    const officeId = String(order.office._id);
    const client = order.client as unknown as { _id: Types.ObjectId; name: string };
    const full = await ProductModel.find(
      { _id: { $in: order.lines.map((l) => l.product._id) } },
      'declaredValue fragile',
    ).lean();
    const office = await OfficeModel.findById(officeId, 'phone').lean();

    let shipmentId: string | undefined;
    try {
      const { shipment } = await ShipmentsService.create(
        {
          pickup: { contactName: client.name, phone: office!.phone },
          originMode: 'dropoff',
          originOfficeId: officeId,
          dropoff: {
            contactName: order.recipient.contactName,
            phone: order.recipient.phone,
            zoneId: order.recipient.zone
              ? String(order.recipient.zone._id ?? order.recipient.zone)
              : undefined,
            area: order.recipient.area,
            address: order.recipient.address,
            landmark: order.recipient.landmark,
          },
          deliveryMode: order.deliveryMode,
          destinationOfficeId: order.destinationOffice
            ? String(order.destinationOffice._id)
            : undefined,
          parcel: {
            size: input.size,
            weightKg: input.weightKg,
            description: describe(order),
            fragile: full.some((p) => p.fragile),
            declaredValue: order.lines.reduce(
              (sum, l) =>
                sum + l.qty * (full.find((p) => p._id.equals(l.product._id))?.declaredValue ?? 0),
              0,
            ),
          },
          serviceLevel: order.serviceLevel,
          paymentMethod: order.paymentMethod,
          notes: [`Order ${order.number}`, order.reference && `ref ${order.reference}`, order.notes]
            .filter(Boolean)
            .join(' · '),
        },
        actor,
        {
          source: order.source === 'admin' ? 'admin' : 'api',
          clientId: String(client._id),
          orderId: id,
        },
      );
      shipmentId = shipment.id;
      await OfficeOpsService.receiveDropoff(
        officeId,
        shipment.id,
        { tagCode: input.tagCode, size: input.size, weightKg: input.weightKg },
        actor,
      );
    } catch (err) {
      if (shipmentId)
        await ShipmentsService.cancel(
          shipmentId,
          { type: 'system' },
          `Packing order ${order.number} failed`,
        ).catch(() => undefined);
      await OrderModel.updateOne({ _id: id, status: 'shipped' }, { $set: { status: previous } });
      throw err;
    }

    await OrderModel.updateOne(
      { _id: id },
      {
        $set: { shipment: new Types.ObjectId(shipmentId) },
        $push: { events: event('shipped', actor, `Packed and handed in`) },
      },
    );
    await StockService.ship(order.office._id, order._id, linesOf(order), stockActor(actor));
    bus.emit('order.status_changed', { orderId: id, from: previous, to: 'shipped' });

    // A local door delivery leaves straight away; anything else waits at the counter as usual.
    await OfficeOpsService.dispatchForDelivery(officeId, shipmentId!).catch((err: unknown) => {
      if (!(err instanceof AppError && err.code === 'ACTION_NOT_ALLOWED')) throw err;
    });
    return this.detail(id);
  },

  async cancel(id: string, actor: Actor, reason?: string, clientId?: string) {
    const order = clientId ? await this.find(id, clientId) : await load({ _id: id });
    if (order.status === 'shipped') return this.cancelPacked(order, actor, reason);
    const before = await move(order._id, CANCELLABLE_ORDER_STATUSES, 'cancelled', actor, {
      note: reason,
    });
    if (!before)
      throw conflict(
        `An order that is ${ORDER_STATUS_META[order.status].label.toLowerCase()} can’t be cancelled`,
      );
    if (before.status !== 'awaiting_stock')
      await StockService.release(before.office, linesOf(before), {
        clientId: before.client.toString(),
      });
    return load({ _id: order._id });
  },

  /**
   * Packed but still on our counter with no rider: unpack it. The order is
   * cancelled first (so the shipment listener leaves it alone), then the
   * shipment, and the units go straight back on the shelf. Once the parcel
   * has left the warehouse it can only come back as a return.
   */
  async cancelPacked(order: OrderDoc, actor: Actor, reason?: string) {
    const shipment = order.shipment
      ? await ShipmentModel.findById(
          order.shipment._id,
          'status currentOffice rider dispatch.state',
        )
      : null;
    const stillHere =
      shipment?.status === 'at_hub' &&
      !shipment.rider &&
      shipment.dispatch.state !== 'offered' &&
      String(shipment.currentOffice) === String(order.office._id);
    if (!shipment || !stillHere)
      throw badRequest(
        'This order has left the warehouse — it can’t be cancelled now. It will come back as a return if undelivered.',
        'ORDER_SHIPPED',
      );

    const claimed = await move(order._id, ['shipped'], 'cancelled', actor, {
      note: [reason, 'Unpacked before dispatch'].filter(Boolean).join(' · '),
      set: { restockedAt: new Date() },
      where: { shipment: shipment._id },
    });
    if (!claimed) throw conflict('This order was updated by someone else — refresh and try again');
    try {
      await ShipmentsService.cancel(
        shipment.id,
        { type: 'system' },
        `Order ${order.number} cancelled`,
      );
    } catch (err) {
      await OrderModel.updateOne(
        { _id: order._id, status: 'cancelled' },
        { $set: { status: 'shipped' }, $unset: { restockedAt: 1 }, $pop: { events: 1 } },
      );
      throw err;
    }
    for (const l of order.lines)
      await StockService.add(
        order.client._id,
        order.office._id,
        l.product._id,
        l.qty,
        'restocked',
        stockActor(actor),
        `order:${order.id}:unpacked:${l.product._id}`,
        { order: order._id, note: 'Order cancelled before dispatch' },
      );
    bus.emit('stock.available', {
      clientId: String(order.client._id),
      officeId: String(order.office._id),
    });
    return load({ _id: order._id });
  },

  /** A returned order: good units back on the shelf, the rest written off. Every unit must be accounted for. */
  async restock(id: string, input: OrderRestockInput, actor: Actor & { officeId?: string }) {
    const order = await load({ _id: id });
    assertOffice(order, actor.officeId);
    const counted = new Map(input.lines.map((l) => [l.productId, l]));
    for (const l of order.lines) {
      const c = counted.get(String(l.product._id));
      if (!c || c.restockQty + c.writeOffQty !== l.qty)
        throw badRequest(`Account for all ${l.qty} × ${l.sku}: restocked plus written off`);
    }
    const claimed = await OrderModel.findOneAndUpdate(
      { _id: id, status: 'returned', restockedAt: null },
      {
        $set: { restockedAt: new Date() },
        $push: {
          events: event('returned', actor, restockNote(order, counted, input.note)),
        },
      },
    );
    if (!claimed)
      throw conflict('Only a returned order that hasn’t been restocked can be restocked');
    for (const l of order.lines) {
      const c = counted.get(String(l.product._id))!;
      await StockService.add(
        order.client._id,
        order.office._id,
        l.product._id,
        c.restockQty,
        'restocked',
        stockActor(actor),
        `order:${id}:restocked:${l.product._id}`,
        { order: order._id, note: c.writeOffQty ? `${c.writeOffQty} written off` : undefined },
      );
    }
    if (input.lines.some((l) => l.restockQty > 0))
      bus.emit('stock.available', {
        clientId: String(order.client._id),
        officeId: String(order.office._id),
      });
    return this.detail(id);
  },

  /** Stock arrived: reserve waiting orders oldest-first until one doesn't fit. */
  async retryBackorders(clientId: string, officeId: string) {
    const waiting = await OrderModel.find(
      { client: clientId, office: officeId, status: 'awaiting_stock' },
      'lines office',
    )
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    for (const o of waiting) {
      // Claim first so a concurrent retry can't reserve the same order twice.
      const claimed = await OrderModel.findOneAndUpdate(
        { _id: o._id, status: 'awaiting_stock' },
        { $set: { status: 'ready_to_pick' } },
      );
      if (!claimed) continue;
      if (await StockService.reserve(o.office, linesOf(o))) {
        await OrderModel.updateOne(
          { _id: o._id },
          {
            $push: {
              events: event('ready_to_pick', { type: 'system' }, 'Stock arrived and was reserved'),
            },
          },
        );
        bus.emit('order.status_changed', {
          orderId: o._id.toString(),
          from: 'awaiting_stock',
          to: 'ready_to_pick',
        });
      } else {
        await OrderModel.updateOne(
          { _id: o._id, status: 'ready_to_pick' },
          { $set: { status: 'awaiting_stock' } },
        );
      }
    }
  },

  /** Keeps a shipped order in step with its shipment's outcome. */
  async syncFromShipment(shipmentId: string, to: ShipmentStatus) {
    const next = orderStatusForShipment(to);
    if (!next) return;
    const order = await OrderModel.findOne({ shipment: shipmentId, status: 'shipped' }, '_id');
    if (!order) return;
    await move(
      order._id,
      ['shipped'],
      next,
      { type: 'system' },
      {
        where: { shipment: new Types.ObjectId(shipmentId) },
        note:
          next === 'returned' ? 'Shipment came back — restock or write off the items' : undefined,
      },
    );
  },

  toDto: toOrderDto,
};

function assertOffice(order: OrderDoc, officeId?: string) {
  if (officeId && String(order.office._id) !== officeId)
    throw forbidden('This order ships from another warehouse');
}

/** "3 items: 2× Shea butter 250ml, 1× Black soap" — the parcel description riders see. */
function describe(order: Pick<IOrder, 'lines'>) {
  const units = order.lines.reduce((n, l) => n + l.qty, 0);
  const text = order.lines.map((l) => `${l.qty}× ${l.name}`).join(', ');
  return `${units} item${units === 1 ? '' : 's'}: ${text}`.slice(0, 200);
}

function restockNote(
  order: Pick<IOrder, 'lines'>,
  counted: Map<string, { restockQty: number; writeOffQty: number }>,
  note?: string,
) {
  let back = 0;
  let off = 0;
  for (const l of order.lines) {
    const c = counted.get(String(l.product._id ?? l.product));
    back += c?.restockQty ?? 0;
    off += c?.writeOffQty ?? 0;
  }
  return [`Restocked ${back}`, off && `wrote off ${off}`, note].filter(Boolean).join(' · ');
}
