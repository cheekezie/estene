import { Types, type FilterQuery } from 'mongoose';
import { z } from 'zod';
import { LEDGER_ENTRY_TYPES, type LedgerEntryType } from '@estene/contracts/enums';
import { ObjectIdSchema, PaginationQuerySchema } from '@estene/contracts/common';
import { randomToken } from '../../lib/crypto';
import { badRequest } from '../../lib/errors';
import { paginate } from '../../lib/response';
import { OrderModel } from '../orders/models/order.model';
import { payableAmount } from '../orders/orders.mapper';
import { PricingService } from '../pricing/pricing.service';
import { RiderModel } from '../riders/models/rider.model';
import { LedgerEntryModel, type ILedgerEntry } from './models/ledger-entry.model';

export const RiderMoneySchema = z.object({
  riderId: ObjectIdSchema,
  amount: z.number().int().positive(),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(300).optional(),
});

export const LedgerQuerySchema = PaginationQuerySchema.extend({
  type: z.enum(LEDGER_ENTRY_TYPES).optional(),
  riderId: ObjectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** How each entry type moves a rider's balance (positive = we owe the rider). */
const RIDER_BALANCE_SIGN: Partial<Record<LedgerEntryType, 1 | -1>> = {
  rider_earning: 1,
  payout: -1,
  cash_collected: -1,
  cash_remitted: 1,
};

type NewEntry = Omit<ILedgerEntry, '_id' | 'createdAt'>;

/** Inserts entries, silently skipping any whose idempotency key already exists. */
async function post(entries: NewEntry[]) {
  if (!entries.length) return;
  try {
    await LedgerEntryModel.insertMany(entries, { ordered: false });
  } catch (err) {
    const dupOnly = (err as { writeErrors?: { code: number }[] }).writeErrors?.every((e) => e.code === 11000);
    if (!dupOnly) throw err;
  }
}

const dateRange = (from?: Date, to?: Date) =>
  from || to ? { createdAt: { ...(from && { $gte: from }), ...(to && { $lte: to }) } } : {};

export const FinanceService = {
  /** Rider took cash from the customer — the rider now owes it to us. */
  async recordCashCollected(orderId: string) {
    const order = await OrderModel.findById(orderId).lean();
    if (!order?.rider) return;
    const amount = payableAmount(order);
    await post([
      { type: 'cash_collected', amount, account: 'rider', rider: order.rider, order: order._id, idempotencyKey: `${orderId}:cash_collected` },
      { type: 'payment_received', amount, account: 'customer', order: order._id, idempotencyKey: `${orderId}:payment_received`, reference: 'cash' },
    ]);
  },

  /**
   * Books a delivered order. Company riders are salaried, so the whole fare is
   * platform revenue; partner riders keep the fare minus our commission.
   */
  async recordDelivery(orderId: string) {
    const order = await OrderModel.findById(orderId).lean();
    if (!order?.rider) return;
    const rider = await RiderModel.findById(order.rider, 'type commissionPct').lean();
    if (!rider) return;

    const amount = payableAmount(order);
    const base = { order: order._id };
    const entries: NewEntry[] = [
      { ...base, type: 'order_charge', amount, account: 'customer', idempotencyKey: `${orderId}:order_charge` },
    ];

    if (rider.type === 'partner') {
      const pct = rider.commissionPct ?? (await PricingService.getConfig()).partnerCommissionPct;
      const commission = Math.round((amount * pct) / 100);
      entries.push(
        { ...base, type: 'platform_revenue', amount: commission, account: 'platform', rider: rider._id, idempotencyKey: `${orderId}:platform_revenue`, note: `${pct}% commission` },
        { ...base, type: 'rider_earning', amount: amount - commission, account: 'rider', rider: rider._id, idempotencyKey: `${orderId}:rider_earning` },
      );
    } else {
      entries.push({ ...base, type: 'platform_revenue', amount, account: 'platform', rider: rider._id, idempotencyKey: `${orderId}:platform_revenue` });
    }
    await post(entries);
  },

  async recordPayout(input: z.infer<typeof RiderMoneySchema>, adminId: string) {
    const rider = await RiderModel.findById(input.riderId, 'type').lean();
    if (!rider) throw badRequest('Rider not found');
    if (rider.type !== 'partner') throw badRequest('Company riders are paid through payroll');
    await post([{ type: 'payout', amount: input.amount, account: 'rider', rider: rider._id, reference: input.reference, note: input.note, createdBy: new Types.ObjectId(adminId), idempotencyKey: `payout:${randomToken(12)}` }]);
  },

  async recordRemittance(input: z.infer<typeof RiderMoneySchema>, adminId: string) {
    await post([{ type: 'cash_remitted', amount: input.amount, account: 'rider', rider: new Types.ObjectId(input.riderId), reference: input.reference, note: input.note, createdBy: new Types.ObjectId(adminId), idempotencyKey: `remit:${randomToken(12)}` }]);
  },

  async summary(from?: Date, to?: Date) {
    const rows = await LedgerEntryModel.aggregate<{ _id: LedgerEntryType; total: number; count: number }>([
      { $match: dateRange(from, to) },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const t = Object.fromEntries(rows.map((r) => [r._id, r.total])) as Partial<Record<LedgerEntryType, number>>;
    return {
      grossBookings: t.order_charge ?? 0,
      platformRevenue: t.platform_revenue ?? 0,
      riderEarnings: t.rider_earning ?? 0,
      payouts: t.payout ?? 0,
      cashOutstanding: (t.cash_collected ?? 0) - (t.cash_remitted ?? 0),
      deliveredOrders: rows.find((r) => r._id === 'order_charge')?.count ?? 0,
    };
  },

  async entries(q: z.infer<typeof LedgerQuerySchema>) {
    const filter: FilterQuery<ILedgerEntry> = { ...dateRange(q.from, q.to) };
    if (q.type) filter.type = q.type;
    if (q.riderId) filter.rider = q.riderId;
    const [items, total] = await Promise.all([
      LedgerEntryModel.find(filter).populate('rider', 'firstName lastName code').populate('order', 'trackingNumber').sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      LedgerEntryModel.countDocuments(filter),
    ]);
    return paginate(items, total, q.page, q.limit);
  },

  /** Per-rider position: positive = we owe them (partner earnings), negative = they hold our cash. */
  async riderBalances() {
    const rows = await LedgerEntryModel.aggregate<{ _id: Types.ObjectId; byType: { k: LedgerEntryType; v: number }[] }>([
      { $match: { account: 'rider', rider: { $exists: true } } },
      { $group: { _id: { rider: '$rider', type: '$type' }, total: { $sum: '$amount' } } },
      { $group: { _id: '$_id.rider', byType: { $push: { k: '$_id.type', v: '$total' } } } },
    ]);
    const riders = await RiderModel.find({ _id: { $in: rows.map((r) => r._id) } }, 'firstName lastName code type').lean();
    const byId = new Map(riders.map((r) => [r._id.toString(), r]));

    return rows
      .map((row) => {
        const t = Object.fromEntries(row.byType.map((x) => [x.k, x.v])) as Partial<Record<LedgerEntryType, number>>;
        const balance = row.byType.reduce((sum, x) => sum + (RIDER_BALANCE_SIGN[x.k] ?? 0) * x.v, 0);
        const r = byId.get(row._id.toString());
        return {
          riderId: row._id.toString(),
          name: r ? `${r.firstName} ${r.lastName}` : 'Unknown',
          code: r?.code,
          type: r?.type,
          earnings: t.rider_earning ?? 0,
          paidOut: t.payout ?? 0,
          cashHeld: (t.cash_collected ?? 0) - (t.cash_remitted ?? 0),
          balance,
        };
      })
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  },
};
