import { Types, type FilterQuery } from 'mongoose';
import type { StockMovementType } from '@estene/contracts/warehouse';
import { randomToken } from '../../lib/crypto';
import { badRequest } from '../../lib/errors';
import { bus } from '../../lib/events';
import { ClientModel } from '../clients/models/client.model';
import { StockLevelModel, type IStockLevel } from './models/stock-level.model';
import { StockMovementModel } from './models/stock-movement.model';

export type StockActor = { type: 'admin' | 'client' | 'system'; id?: string };
export type StockLine = { product: Types.ObjectId | string; qty: number };

const oid = (v: Types.ObjectId | string) => (typeof v === 'string' ? new Types.ObjectId(v) : v);

/** available = onHand − reserved, as a query condition. */
const availableAtLeast = (qty: number): FilterQuery<IStockLevel> => ({
  $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, qty] },
});

async function recordMovement(
  level: IStockLevel,
  type: StockMovementType,
  qty: number,
  actor: StockActor,
  key: string,
  refs: { inbound?: Types.ObjectId; order?: Types.ObjectId; note?: string } = {},
) {
  try {
    await StockMovementModel.create({
      client: level.client,
      product: level.product,
      office: level.office,
      type,
      qty,
      onHandAfter: level.onHand,
      ...refs,
      actorType: actor.type,
      actorId: actor.id,
      idempotencyKey: key,
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

/**
 * Low-stock alerts fire once when a product's available units fall to the
 * client's threshold, and re-arm when it is restocked above it. The flag is
 * claimed with a compare-and-set, so racing writes alert only once.
 */
async function checkLow(office: Types.ObjectId, products: (Types.ObjectId | string)[]) {
  if (!products.length) return;
  const levels = await StockLevelModel.find(
    { office, product: { $in: products.map(oid) } },
    'client product office onHand reserved lowAlertedAt',
  ).lean();
  if (!levels.length) return;
  const client = await ClientModel.findById(
    levels[0]!.client,
    'warehousing.lowStockThreshold',
  ).lean();
  const threshold = client?.warehousing?.lowStockThreshold ?? 5;
  for (const l of levels) {
    const low = l.onHand - l.reserved <= threshold;
    if (low && !l.lowAlertedAt) {
      const res = await StockLevelModel.updateOne(
        { _id: l._id, lowAlertedAt: null },
        { lowAlertedAt: new Date() },
      );
      if (res.modifiedCount)
        bus.emit('stock.low', {
          clientId: l.client.toString(),
          productId: l.product.toString(),
          officeId: l.office.toString(),
        });
    } else if (!low && l.lowAlertedAt) {
      await StockLevelModel.updateOne({ _id: l._id }, { lowAlertedAt: null });
    }
  }
}

/**
 * All stock arithmetic. Every write is a single conditional `$inc`, so two
 * orders racing for the last unit can't both win and on-hand never goes negative.
 */
export const StockService = {
  /**
   * Reserves every line or none. Lines are taken one by one; if a later line
   * is short, the earlier reservations are given back.
   */
  async reserve(officeId: string | Types.ObjectId, lines: StockLine[]) {
    const office = oid(officeId);
    const taken: StockLine[] = [];
    for (const line of lines) {
      const res = await StockLevelModel.updateOne(
        { product: oid(line.product), office, ...availableAtLeast(line.qty) },
        { $inc: { reserved: line.qty } },
      );
      if (!res.modifiedCount) {
        await this.release(office, taken, { emit: false });
        return false;
      }
      taken.push(line);
    }
    await checkLow(
      office,
      lines.map((l) => l.product),
    );
    return true;
  },

  async release(
    officeId: string | Types.ObjectId,
    lines: StockLine[],
    opts: { emit?: boolean; clientId?: string } = {},
  ) {
    const office = oid(officeId);
    for (const line of lines) {
      await StockLevelModel.updateOne(
        { product: oid(line.product), office, reserved: { $gte: line.qty } },
        { $inc: { reserved: -line.qty } },
      );
    }
    await checkLow(
      office,
      lines.map((l) => l.product),
    );
    if (opts.emit !== false && opts.clientId && lines.length)
      bus.emit('stock.available', { clientId: opts.clientId, officeId: office.toString() });
  },

  /** Reserved units leave the shelf in a packed order. */
  async ship(
    officeId: Types.ObjectId,
    orderId: Types.ObjectId,
    lines: StockLine[],
    actor: StockActor,
  ) {
    for (const line of lines) {
      const level = await StockLevelModel.findOneAndUpdate(
        {
          product: oid(line.product),
          office: officeId,
          onHand: { $gte: line.qty },
          reserved: { $gte: line.qty },
        },
        { $inc: { onHand: -line.qty, reserved: -line.qty } },
        { new: true },
      );
      // Reservation is taken at order time, so this only fails if someone adjusted reserved stock away.
      if (!level)
        throw badRequest('Stock for this order is no longer reserved — recount the shelf');
      await recordMovement(
        level,
        'shipped',
        -line.qty,
        actor,
        `order:${orderId}:shipped:${line.product}`,
        {
          order: orderId,
        },
      );
    }
  },

  /** Adds units to the shelf (inbound count or a restocked return), creating the level on first arrival. */
  async add(
    clientId: Types.ObjectId,
    officeId: Types.ObjectId,
    product: Types.ObjectId,
    qty: number,
    type: 'received' | 'restocked' | 'transferred_in',
    actor: StockActor,
    key: string,
    refs: { inbound?: Types.ObjectId; order?: Types.ObjectId; note?: string } = {},
  ) {
    if (qty <= 0) return;
    // Callers claim the inbound/order with a compare-and-set first; this stops a retry of the same step.
    if (await StockMovementModel.exists({ idempotencyKey: key })) return;
    const level = await StockLevelModel.findOneAndUpdate(
      { product, office: officeId },
      { $inc: { onHand: qty }, $setOnInsert: { client: clientId, reserved: 0 } },
      { new: true, upsert: true },
    );
    await recordMovement(level, type, qty, actor, key, refs);
    await checkLow(officeId, [product]);
  },

  /**
   * Units leave a warehouse for another one. All lines or none: each takes
   * only available units, and earlier lines are put back if a later one is short.
   */
  async transferOut(
    officeId: Types.ObjectId,
    inboundId: Types.ObjectId,
    lines: StockLine[],
    actor: StockActor,
    note: string,
  ) {
    const taken: { line: StockLine; level: IStockLevel }[] = [];
    for (const line of lines) {
      const level = await StockLevelModel.findOneAndUpdate(
        { product: oid(line.product), office: officeId, ...availableAtLeast(line.qty) },
        { $inc: { onHand: -line.qty } },
        { new: true },
      );
      if (!level) {
        for (const t of taken)
          await StockLevelModel.updateOne(
            { product: oid(t.line.product), office: officeId },
            { $inc: { onHand: t.line.qty } },
          );
        return false;
      }
      taken.push({ line, level });
    }
    for (const { line, level } of taken)
      await recordMovement(
        level,
        'transferred_out',
        -line.qty,
        actor,
        `transfer:${inboundId}:out:${line.product}`,
        { inbound: inboundId, note },
      );
    await checkLow(
      officeId,
      lines.map((l) => l.product),
    );
    return true;
  },

  /** Manual correction after a count. Can't take away units already reserved for orders. */
  async adjust(
    input: {
      productId: string;
      officeId: string;
      delta: number;
      type: 'adjusted' | 'written_off';
      reason: string;
    },
    actor: StockActor,
  ) {
    const filter: FilterQuery<IStockLevel> = {
      product: oid(input.productId),
      office: oid(input.officeId),
      ...(input.delta < 0 && availableAtLeast(-input.delta)),
    };
    const level = await StockLevelModel.findOneAndUpdate(
      filter,
      { $inc: { onHand: input.delta } },
      { new: true },
    );
    if (!level)
      throw badRequest(
        input.delta < 0
          ? 'That would remove units already reserved for orders — cancel or pack them first'
          : 'No stock record for this product here yet — receive it through an inbound first',
      );
    await recordMovement(level, input.type, input.delta, actor, `adjust:${randomToken(12)}`, {
      note: input.reason,
    });
    await checkLow(level.office, [level.product]);
    if (input.delta > 0)
      bus.emit('stock.available', {
        clientId: level.client.toString(),
        officeId: level.office.toString(),
      });
    return level;
  },
};
