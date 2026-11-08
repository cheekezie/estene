import { Types, type FilterQuery } from 'mongoose';
import type { PaginationQuery } from '@estene/contracts/common';
import type {
  InboundCreateInput,
  InboundReceiveInput,
  InboundStatus,
  ProductInput,
  WarehousingSettingsDto,
  WarehousingSettingsInput,
  WarehouseSummaryDto,
} from '@estene/contracts/warehouse';
import { ProductUpdateSchema } from '@estene/contracts/warehouse';
import type { z } from 'zod';
import { randomCode } from '../../lib/crypto';
import { searchRegex } from '../../lib/db';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { bus } from '../../lib/events';
import { paginate } from '../../lib/response';
import { AdminModel } from '../admins/models/admin.model';
import { ClientModel, type IClient } from '../clients/models/client.model';
import { OfficeModel } from '../offices/models/office.model';
import { InboundModel, type IInbound } from './models/inbound.model';
import { OrderModel } from './models/order.model';
import { ProductModel, type IProduct } from './models/product.model';
import { StockLevelModel, type IStockLevel } from './models/stock-level.model';
import { StockMovementModel, type IStockMovement } from './models/stock-movement.model';
import { StockService, type StockActor } from './stock.service';
import {
  INBOUND_POPULATE,
  MOVEMENT_POPULATE,
  STOCK_POPULATE,
  toInboundDto,
  toMovementDto,
  toProductDto,
  toStockDto,
} from './warehousing.mapper';

const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;
const OPEN_ORDER_STATUSES = ['awaiting_stock', 'ready_to_pick', 'picking'] as const;

export type WarehousingClient = Pick<IClient, '_id' | 'name'> & {
  warehousing: NonNullable<IClient['warehousing']>;
};

/** The client must exist, be active and have warehousing switched on. */
export async function warehousingClient(clientId: string): Promise<WarehousingClient> {
  const client = await ClientModel.findById(clientId, 'name status warehousing').lean();
  if (!client) throw notFound('Client not found');
  if (client.status !== 'active') throw badRequest('This business account is not active');
  if (!client.warehousing?.enabled)
    throw new AppError(403, 'Warehousing is not enabled for this account', 'WAREHOUSING_DISABLED');
  return client as WarehousingClient;
}

export async function generateNumber(prefix: 'ORD' | 'IN') {
  const model = prefix === 'ORD' ? OrderModel : InboundModel;
  for (let i = 0; i < 5; i++) {
    const candidate = `${prefix}-${randomCode(8)}`;
    if (!(await (model as typeof OrderModel).exists({ number: candidate }))) return candidate;
  }
  throw new AppError(500, 'Could not allocate a number', 'NUMBER_EXHAUSTED');
}

/**
 * Turns `{ productId | sku, qty }` lines into the client's products, merging
 * repeats. Unknown or inactive SKUs are a 400 naming the SKU, so an integrator
 * can see exactly which line is wrong.
 */
export async function resolveLines<T extends { productId?: string; sku?: string }>(
  clientId: string | Types.ObjectId,
  lines: T[],
  qtyOf: (l: T) => number,
) {
  const ids = lines.flatMap((l) => (l.productId ? [l.productId] : []));
  const skus = lines.flatMap((l) => (!l.productId && l.sku ? [l.sku] : []));
  const products = await ProductModel.find({
    client: clientId,
    $or: [{ _id: { $in: ids } }, { sku: { $in: skus } }],
  }).lean();
  const merged = new Map<string, { product: IProduct; qty: number }>();
  for (const l of lines) {
    const p = products.find((x) =>
      l.productId ? x._id.toString() === l.productId : x.sku === l.sku,
    );
    if (!p) throw badRequest(`Unknown product ${l.sku ?? l.productId}`, 'UNKNOWN_PRODUCT');
    if (!p.isActive) throw badRequest(`Product ${p.sku} is inactive`, 'INACTIVE_PRODUCT');
    const key = p._id.toString();
    merged.set(key, { product: p, qty: (merged.get(key)?.qty ?? 0) + qtyOf(l) });
  }
  return [...merged.values()];
}

async function actorNames(rows: IStockMovement[]) {
  const ids = [
    ...new Set(
      rows.filter((m) => m.actorType === 'admin' && m.actorId).map((m) => m.actorId!.toString()),
    ),
  ];
  const admins = ids.length ? await AdminModel.find({ _id: { $in: ids } }, 'name').lean() : [];
  return new Map(admins.map((a) => [a._id.toString(), a.name]));
}

const loadInbound = async (filter: FilterQuery<IInbound>) => {
  const inbound = await InboundModel.findOne(filter).populate(INBOUND_POPULATE);
  if (!inbound) throw notFound('Inbound not found');
  return inbound;
};

export const WarehousingService = {
  // ── Client settings ───────────────────────────────────────────────────────

  async settings(clientId: string): Promise<WarehousingSettingsDto | null> {
    const client = await ClientModel.findById(clientId, 'warehousing')
      .populate({ path: 'warehousing.office', select: 'name code' })
      .lean();
    if (!client) throw notFound('Client not found');
    const w = client.warehousing;
    if (!w) return null;
    const office = w.office as unknown as { _id: Types.ObjectId; name: string; code: string };
    return {
      enabled: w.enabled,
      office: { id: office._id.toString(), name: office.name, code: office.code },
      monthlyFee: w.monthlyFee,
      lowStockThreshold: w.lowStockThreshold,
      enabledAt: w.enabledAt?.toISOString() ?? null,
    };
  },

  async saveSettings(clientId: string, input: WarehousingSettingsInput) {
    const office = await OfficeModel.findOne(
      { _id: input.officeId, isActive: true },
      'isWarehouse',
    ).lean();
    if (!office?.isWarehouse) throw badRequest('Choose an office that is set up as a warehouse');
    const client = await ClientModel.findById(clientId, 'warehousing');
    if (!client) throw notFound('Client not found');
    const prev = client.warehousing;
    if (prev && prev.office.toString() !== input.officeId) {
      const held = await StockLevelModel.exists({
        client: clientId,
        office: prev.office,
        onHand: { $gt: 0 },
      });
      if (held)
        throw conflict(
          'This client still has stock in its current warehouse — move it with a stock transfer first',
        );
      const expected = await InboundModel.exists({
        client: clientId,
        office: prev.office,
        status: 'expected',
      });
      if (expected)
        throw conflict(
          'Deliveries are still expected at the current warehouse — receive or cancel them first',
        );
    }
    const now = new Date();
    client.warehousing = {
      enabled: input.enabled,
      office: new Types.ObjectId(input.officeId),
      monthlyFee: input.monthlyFee,
      lowStockThreshold: input.lowStockThreshold,
      enabledAt: input.enabled ? (prev?.enabled ? prev.enabledAt : now) : prev?.enabledAt,
      disabledAt: input.enabled ? undefined : prev?.enabled ? now : prev?.disabledAt,
    };
    await client.save();
    // Orders still waiting for stock now wait at the new warehouse.
    if (prev && prev.office.toString() !== input.officeId)
      await OrderModel.updateMany(
        { client: clientId, office: prev.office, status: 'awaiting_stock' },
        { $set: { office: new Types.ObjectId(input.officeId) } },
      );
    return this.settings(clientId);
  },

  /** Clients with warehousing on — for the admin's client picker. */
  async clients() {
    const rows = await ClientModel.find({ 'warehousing.enabled': true }, 'name warehousing')
      .populate({ path: 'warehousing.office', select: 'name code' })
      .sort({ name: 1 })
      .lean();
    return rows.map((c) => {
      const o = c.warehousing!.office as unknown as {
        _id: Types.ObjectId;
        name: string;
        code: string;
      };
      return {
        id: c._id.toString(),
        name: c.name,
        office: { id: o._id.toString(), name: o.name, code: o.code },
      };
    });
  },

  async summary(clientId: string): Promise<WarehouseSummaryDto> {
    const client = await ClientModel.findById(clientId, 'warehousing').lean();
    const threshold = client?.warehousing?.lowStockThreshold ?? 5;
    const cid = new Types.ObjectId(clientId);
    const [products, stock, openOrders, awaitingStock, expectedInbounds] = await Promise.all([
      ProductModel.countDocuments({ client: cid, isActive: true }),
      StockLevelModel.aggregate<{ units: number; low: number }>([
        { $match: { client: cid } },
        {
          $group: {
            _id: null,
            units: { $sum: '$onHand' },
            low: {
              $sum: {
                $cond: [{ $lte: [{ $subtract: ['$onHand', '$reserved'] }, threshold] }, 1, 0],
              },
            },
          },
        },
      ]),
      OrderModel.countDocuments({ client: cid, status: { $in: OPEN_ORDER_STATUSES } }),
      OrderModel.countDocuments({ client: cid, status: 'awaiting_stock' }),
      InboundModel.countDocuments({ client: cid, status: 'expected' }),
    ]);
    return {
      products,
      unitsOnHand: stock[0]?.units ?? 0,
      lowStock: stock[0]?.low ?? 0,
      openOrders,
      awaitingStock,
      expectedInbounds,
    };
  },

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(clientId: string, q: PaginationQuery & { active?: 'true' | 'false' }) {
    const filter: FilterQuery<IProduct> = { client: clientId };
    if (q.active) filter.isActive = q.active === 'true';
    if (q.search) {
      const rx = searchRegex(q.search);
      filter.$or = [{ sku: rx }, { name: rx }, { barcode: rx }];
    }
    const [rows, total] = await Promise.all([
      ProductModel.find(filter)
        .sort({ name: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      ProductModel.countDocuments(filter),
    ]);
    return paginate(rows.map(toProductDto), total, q.page, q.limit);
  },

  async getProduct(clientId: string, ref: string) {
    const or: FilterQuery<IProduct>[] = [{ sku: ref }];
    if (/^[a-f\d]{24}$/i.test(ref)) or.push({ _id: ref });
    const product = await ProductModel.findOne({ client: clientId, $or: or }).lean();
    if (!product) throw notFound('Product not found');
    return product;
  },

  async createProduct(clientId: string, input: ProductInput) {
    await warehousingClient(clientId);
    try {
      return toProductDto((await ProductModel.create({ ...input, client: clientId })).toObject());
    } catch (err) {
      if (isDuplicateKey(err)) throw conflict(`SKU ${input.sku} already exists`, 'DUPLICATE_SKU');
      throw err;
    }
  },

  async updateProduct(clientId: string, ref: string, input: z.infer<typeof ProductUpdateSchema>) {
    const product = await this.getProduct(clientId, ref);
    const updated = await ProductModel.findByIdAndUpdate(product._id, input, { new: true }).lean();
    return toProductDto(updated!);
  },

  // ── Stock ─────────────────────────────────────────────────────────────────

  async listStock(
    q: PaginationQuery & { clientId?: string; officeId?: string; lowOnly?: 'true' | 'false' },
  ) {
    if (!q.clientId && !q.officeId) throw badRequest('Choose a client or a warehouse');
    const filter: FilterQuery<IStockLevel> = {};
    if (q.clientId) filter.client = new Types.ObjectId(q.clientId);
    if (q.officeId) filter.office = new Types.ObjectId(q.officeId);
    // Thresholds are per client; a warehouse-wide view uses each row's client setting.
    const clients = await ClientModel.find(
      q.clientId ? { _id: q.clientId } : {},
      'warehousing.lowStockThreshold',
    ).lean();
    const threshold = new Map(
      clients.map((c) => [c._id.toString(), c.warehousing?.lowStockThreshold ?? 5]),
    );
    if (q.search) {
      const rx = searchRegex(q.search);
      const ids = await ProductModel.find(
        {
          ...(q.clientId && { client: q.clientId }),
          $or: [{ sku: rx }, { name: rx }, { barcode: rx }],
        },
        '_id',
      ).lean();
      filter.product = { $in: ids.map((p) => p._id) };
    }
    // A client's catalogue is hundreds of rows, not millions: filter and sort low-first in memory.
    const rows = await StockLevelModel.find(filter).populate(STOCK_POPULATE).lean();
    let items = rows.map((r) => toStockDto(r, threshold.get(r.client.toString()) ?? 5));
    if (q.lowOnly === 'true') items = items.filter((i) => i.low);
    items.sort(
      (a, b) => Number(b.low) - Number(a.low) || a.product.name.localeCompare(b.product.name),
    );
    const total = items.length;
    return paginate(items.slice((q.page - 1) * q.limit, q.page * q.limit), total, q.page, q.limit);
  },

  async setBin(input: { productId: string; officeId: string; bin: string | null }) {
    const res = await StockLevelModel.updateOne(
      { product: input.productId, office: input.officeId },
      { bin: input.bin || null },
    );
    if (!res.matchedCount) throw notFound('No stock record for this product here yet');
  },

  async movements(q: PaginationQuery & { clientId?: string; productId?: string }) {
    if (!q.clientId && !q.productId) throw badRequest('Choose a client or a product');
    const filter: FilterQuery<IStockMovement> = {};
    if (q.clientId) filter.client = q.clientId;
    if (q.productId) filter.product = q.productId;
    const [rows, total] = await Promise.all([
      StockMovementModel.find(filter)
        .populate(MOVEMENT_POPULATE)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      StockMovementModel.countDocuments(filter),
    ]);
    const names = await actorNames(rows);
    return paginate(
      rows.map((m) => toMovementDto(m, names)),
      total,
      q.page,
      q.limit,
    );
  },

  // ── Inbound ───────────────────────────────────────────────────────────────

  async listInbounds(
    q: PaginationQuery & { clientId?: string; officeId?: string; status?: InboundStatus },
  ) {
    const filter: FilterQuery<IInbound> = {};
    if (q.clientId) filter.client = q.clientId;
    if (q.officeId) filter.office = q.officeId;
    if (q.status) filter.status = q.status;
    if (q.search) {
      const rx = searchRegex(q.search);
      filter.$or = [{ number: rx }, { reference: rx }];
    }
    const [rows, total] = await Promise.all([
      InboundModel.find(filter)
        .populate(INBOUND_POPULATE)
        .sort({ status: 1, expectedAt: 1, createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      InboundModel.countDocuments(filter),
    ]);
    return paginate(rows, total, q.page, q.limit);
  },

  /** By our id, our IN- number or the client's reference. Scoped to a client when given. */
  async findInbound(ref: string, clientId?: string) {
    const or: FilterQuery<IInbound>[] = [{ number: ref.toUpperCase() }, { reference: ref }];
    if (/^[a-f\d]{24}$/i.test(ref)) or.push({ _id: ref });
    return loadInbound({ ...(clientId && { client: clientId }), $or: or });
  },

  /** Idempotent on (client, reference): a repeat returns the original. */
  async createInbound(clientId: string, input: InboundCreateInput) {
    const client = await warehousingClient(clientId);
    if (input.reference) {
      const existing = await InboundModel.findOne({ client: clientId, reference: input.reference });
      if (existing) return { inbound: await loadInbound({ _id: existing._id }), created: false };
    }
    const office = input.officeId ?? client.warehousing.office.toString();
    if (office !== client.warehousing.office.toString())
      throw badRequest('Stock for this client goes to its assigned warehouse');
    const lines = await resolveLines(clientId, input.lines, (l) => l.expectedQty);
    try {
      const inbound = await InboundModel.create({
        client: clientId,
        office,
        number: await generateNumber('IN'),
        reference: input.reference,
        expectedAt: input.expectedAt,
        notes: input.notes,
        lines: lines.map((l) => ({ product: l.product._id, expectedQty: l.qty })),
      });
      return { inbound: await loadInbound({ _id: inbound._id }), created: true };
    } catch (err) {
      if (isDuplicateKey(err) && input.reference) {
        const existing = await InboundModel.findOne({
          client: clientId,
          reference: input.reference,
        });
        if (existing) return { inbound: await loadInbound({ _id: existing._id }), created: false };
      }
      throw err;
    }
  },

  /**
   * The warehouse counted the delivery. Good units go on the shelf; damaged
   * ones are recorded but not stocked. Claimed with a compare-and-set, so a
   * double-submit can't count the goods twice.
   */
  async receiveInbound(
    id: string,
    input: InboundReceiveInput,
    actor: StockActor & { officeId?: string },
  ) {
    const current = await InboundModel.findById(
      id,
      'office status lines client transferFrom',
    ).lean();
    if (!current) throw notFound('Inbound not found');
    if (actor.officeId && current.office.toString() !== actor.officeId)
      throw forbidden('You can only receive stock at your own office');
    const counted = new Map(input.lines.map((l) => [l.productId, l]));
    for (const id of counted.keys())
      if (!current.lines.some((l) => l.product.toString() === id))
        throw badRequest('A counted product is not on this inbound');

    const lines = current.lines.map((l) => {
      const c = counted.get(l.product.toString());
      return { ...l, receivedQty: c?.receivedQty ?? 0, damagedQty: c?.damagedQty ?? 0 };
    });
    const claimed = await InboundModel.findOneAndUpdate(
      { _id: id, status: 'expected' },
      {
        status: 'received',
        lines,
        receivedAt: new Date(),
        ...(actor.type === 'admin' && { receivedBy: actor.id }),
        ...(input.notes && { notes: input.notes }),
      },
      { new: true },
    );
    if (!claimed) throw conflict('This inbound was already received or cancelled');

    for (const l of lines)
      await StockService.add(
        claimed.client,
        claimed.office,
        l.product,
        l.receivedQty,
        current.transferFrom ? 'transferred_in' : 'received',
        actor,
        `inbound:${claimed.id}:${l.product}`,
        { inbound: claimed._id },
      );
    bus.emit('stock.available', {
      clientId: claimed.client.toString(),
      officeId: claimed.office.toString(),
    });
    bus.emit('inbound.received', { inboundId: claimed.id });
    return toInboundDto(await loadInbound({ _id: claimed._id }));
  },

  async cancelInbound(ref: string, clientId?: string) {
    const inbound = await this.findInbound(ref, clientId);
    // Transfers are Estene's own moves between warehouses; only staff can call one off.
    if (clientId && inbound.transferFrom)
      throw forbidden('This is a transfer between Estene warehouses — ask Estene to cancel it');
    const updated = await InboundModel.findOneAndUpdate(
      { _id: inbound._id, status: 'expected' },
      { status: 'cancelled' },
      { new: true },
    );
    if (!updated) throw conflict('Only an inbound that hasn’t arrived can be cancelled');
    // A cancelled transfer never left in practice: the units go back to the origin shelf.
    if (updated.transferFrom) {
      for (const l of updated.lines)
        await StockService.add(
          updated.client,
          updated.transferFrom,
          l.product,
          l.expectedQty,
          'transferred_in',
          { type: clientId ? 'client' : 'system', id: clientId },
          `transfer:${updated.id}:cancelled:${l.product}`,
          { inbound: updated._id, note: 'Transfer cancelled' },
        );
      bus.emit('stock.available', {
        clientId: updated.client.toString(),
        officeId: updated.transferFrom.toString(),
      });
    }
    return loadInbound({ _id: updated._id });
  },
};
