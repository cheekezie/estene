import { Types, type FilterQuery } from 'mongoose';
import { z } from 'zod';
import { LEDGER_ENTRY_TYPES, type LedgerEntryType } from '@estene/contracts/enums';
import { ObjectIdSchema, PaginationQuerySchema } from '@estene/contracts/common';
import { randomToken } from '../../lib/crypto';
import { paginate } from '../../lib/response';
import { PaymentModel } from '../payments/models/payment.model';
import { PayoutModel } from '../payouts/models/payout.model';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { payableAmount } from '../shipments/shipments.mapper';
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
    const dupOnly = (err as { writeErrors?: { code: number }[] }).writeErrors?.every(
      (e) => e.code === 11000,
    );
    if (!dupOnly) throw err;
  }
}

const dateRange = (from?: Date, to?: Date) =>
  from || to ? { createdAt: { ...(from && { $gte: from }), ...(to && { $lte: to }) } } : {};

export const FinanceService = {
  /**
   * Posts a successful payment. Cash in a rider's hand also becomes a debt the
   * rider owes us until it's remitted. Keyed per payment, so a booking and a
   * later balance top-up on the same shipment are both recorded.
   */
  async recordPayment(paymentId: string) {
    const payment = await PaymentModel.findById(paymentId).lean();
    if (!payment || payment.status !== 'success') return;
    const entries: NewEntry[] = [
      {
        type: 'payment_received',
        amount: payment.amount,
        account: 'customer',
        shipment: payment.shipment,
        client: payment.client ?? undefined,
        reference: payment.reference,
        note: payment.channel,
        idempotencyKey: `payment:${paymentId}:received`,
      },
    ];
    if (payment.channel === 'cash' && payment.collectedBy) {
      entries.push({
        type: 'cash_collected',
        amount: payment.amount,
        account: 'rider',
        rider: payment.collectedBy,
        shipment: payment.shipment,
        reference: payment.reference,
        idempotencyKey: `payment:${paymentId}:cash`,
      });
    }
    await post(entries);
  },

  /** Delivered on-account charges and storage fees minus payments received for that client. */
  async clientOutstanding(clientId: string) {
    const rows = await LedgerEntryModel.aggregate<{ _id: LedgerEntryType; total: number }>([
      {
        $match: {
          client: new Types.ObjectId(clientId),
          type: { $in: ['shipment_charge', 'storage_fee', 'payment_received'] },
        },
      },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);
    const t = Object.fromEntries(rows.map((r) => [r._id, r.total]));
    return (t.shipment_charge ?? 0) + (t.storage_fee ?? 0) - (t.payment_received ?? 0);
  },

  /**
   * Books a completed shipment (delivered or collected). Each rider leg is
   * paid on its own fare: partner riders keep it minus commission; company
   * riders are salaried. Whatever isn't paid to partners is Estene revenue.
   * Door-to-door has one `full` leg, so it books exactly as before.
   */
  async recordDelivery(shipmentId: string) {
    const shipment = await ShipmentModel.findById(shipmentId).lean();
    if (!shipment) return;
    const legs = shipment.riderLegs?.length
      ? shipment.riderLegs
      : shipment.rider
        ? [
            {
              rider: shipment.rider,
              kind: 'full' as const,
              fare: payableAmount(shipment),
              completedAt: new Date(),
            },
          ]
        : [];

    const amount = payableAmount(shipment);
    const base = { shipment: shipment._id };
    const entries: NewEntry[] = [
      {
        ...base,
        type: 'shipment_charge',
        amount,
        account: 'customer',
        client: shipment.client ?? undefined,
        idempotencyKey: `${shipmentId}:shipment_charge`,
      },
    ];

    const riders = await RiderModel.find(
      { _id: { $in: legs.map((l) => l.rider) } },
      'type commissionPct',
    ).lean();
    const defaultPct = (await PricingService.getConfig()).partnerCommissionPct;
    let paidToPartners = 0;

    legs.forEach((leg, i) => {
      const rider = riders.find((r) => String(r._id) === String(leg.rider));
      if (rider?.type !== 'partner') return;
      const fare = Math.min(leg.fare, amount - paidToPartners);
      if (fare <= 0) return;
      const pct = rider.commissionPct ?? defaultPct;
      const commission = Math.round((fare * pct) / 100);
      paidToPartners += fare;
      entries.push(
        {
          ...base,
          type: 'platform_revenue',
          amount: commission,
          account: 'platform',
          rider: rider._id,
          idempotencyKey: `${shipmentId}:leg${i}:commission`,
          note: `${pct}% commission · ${leg.kind.replace('_', ' ')}`,
        },
        {
          ...base,
          type: 'rider_earning',
          amount: fare - commission,
          account: 'rider',
          rider: rider._id,
          idempotencyKey: `${shipmentId}:leg${i}:earning`,
          note: leg.kind.replace('_', ' '),
        },
      );
    });

    const remainder = amount - paidToPartners;
    if (remainder > 0) {
      entries.push({
        ...base,
        type: 'platform_revenue',
        amount: remainder,
        account: 'platform',
        idempotencyKey: `${shipmentId}:platform_revenue`,
      });
    }
    await post(entries);
  },

  /** Money out to a partner rider — posted only once the payout has actually succeeded. */
  async recordPayout(payoutId: string) {
    const payout = await PayoutModel.findById(payoutId).lean();
    if (!payout || payout.status !== 'success') return;
    await post([
      {
        type: 'payout',
        amount: payout.amount,
        account: 'rider',
        rider: payout.rider,
        reference: payout.reference,
        note: payout.method === 'manual' ? 'Recorded manually' : 'Bank transfer',
        createdBy: payout.initiatedBy,
        idempotencyKey: `payout:${payoutId}`,
      },
    ]);
  },

  /** One warehousing client's flat fee for one month (`YYYY-MM`). Safe to re-run. */
  async recordStorageFee(clientId: string, month: string, amount: number) {
    if (amount <= 0) return;
    await post([
      {
        type: 'storage_fee',
        amount,
        account: 'customer',
        client: new Types.ObjectId(clientId),
        reference: `STORAGE-${month}`,
        note: `Warehousing fee for ${month}`,
        idempotencyKey: `storage:${clientId}:${month}`,
      },
    ]);
  },

  async recordRemittance(input: z.infer<typeof RiderMoneySchema>, adminId: string) {
    await post([
      {
        type: 'cash_remitted',
        amount: input.amount,
        account: 'rider',
        rider: new Types.ObjectId(input.riderId),
        reference: input.reference,
        note: input.note,
        createdBy: new Types.ObjectId(adminId),
        idempotencyKey: `remit:${randomToken(12)}`,
      },
    ]);
  },

  async summary(from?: Date, to?: Date) {
    const rows = await LedgerEntryModel.aggregate<{
      _id: LedgerEntryType;
      total: number;
      count: number;
    }>([
      { $match: dateRange(from, to) },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const t = Object.fromEntries(rows.map((r) => [r._id, r.total])) as Partial<
      Record<LedgerEntryType, number>
    >;
    return {
      grossBookings: t.shipment_charge ?? 0,
      platformRevenue: t.platform_revenue ?? 0,
      riderEarnings: t.rider_earning ?? 0,
      payouts: t.payout ?? 0,
      cashOutstanding: (t.cash_collected ?? 0) - (t.cash_remitted ?? 0),
      deliveredShipments: rows.find((r) => r._id === 'shipment_charge')?.count ?? 0,
    };
  },

  async entries(q: z.infer<typeof LedgerQuerySchema>) {
    const filter: FilterQuery<ILedgerEntry> = { ...dateRange(q.from, q.to) };
    if (q.type) filter.type = q.type;
    if (q.riderId) filter.rider = q.riderId;
    const [items, total] = await Promise.all([
      LedgerEntryModel.find(filter)
        .populate('rider', 'firstName lastName code')
        .populate('shipment', 'trackingNumber')
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      LedgerEntryModel.countDocuments(filter),
    ]);
    return paginate(items, total, q.page, q.limit);
  },

  /** Per-rider position: positive = we owe them (partner earnings), negative = they hold our cash. */
  async riderBalances() {
    const rows = await LedgerEntryModel.aggregate<{
      _id: Types.ObjectId;
      byType: { k: LedgerEntryType; v: number }[];
    }>([
      { $match: { account: 'rider', rider: { $exists: true } } },
      { $group: { _id: { rider: '$rider', type: '$type' }, total: { $sum: '$amount' } } },
      { $group: { _id: '$_id.rider', byType: { $push: { k: '$_id.type', v: '$total' } } } },
    ]);
    const riders = await RiderModel.find(
      { _id: { $in: rows.map((r) => r._id) } },
      'firstName lastName code type',
    ).lean();
    const byId = new Map(riders.map((r) => [r._id.toString(), r]));

    return rows
      .map((row) => {
        const t = Object.fromEntries(row.byType.map((x) => [x.k, x.v])) as Partial<
          Record<LedgerEntryType, number>
        >;
        const balance = row.byType.reduce(
          (sum, x) => sum + (RIDER_BALANCE_SIGN[x.k] ?? 0) * x.v,
          0,
        );
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
