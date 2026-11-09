import { Types } from 'mongoose';
import {
  DEFAULT_HANDLING_FEE,
  handlingFeeFor,
  type AdminHandlingFeesViewDto,
  type FreePeriodDto,
  type FreePeriodInput,
  type HandlingFeeDto,
  type HandlingFeeEstimateDto,
  type HandlingFeeSettings,
  type HandlingFeesViewDto,
  type HandlingFeeStatus,
} from '@estene/contracts/handling-fee';
import type { StockMovementType } from '@estene/contracts/warehouse';
import { randomCode } from '../../lib/crypto';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { bus } from '../../lib/events';
import { AdminModel } from '../admins/models/admin.model';
import { ClientModel, type IClient } from '../clients/models/client.model';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../pricing/pricing.service';
import { StockMovementModel } from '../warehousing/models/stock-movement.model';
import { addDays, cycleAt, cycleBounds } from './cycles';
import { HandlingFeeModel, type IHandlingFee } from './models/handling-fee.model';

type BillingClient = Pick<IClient, '_id' | 'warehousing'>;

/**
 * Moves between the client's own warehouses: the units were ours before and
 * after, so a transfer is neither "added" nor does it drop units in transit.
 */
const TRANSFERS: StockMovementType[] = ['transferred_out', 'transferred_in'];
/** Movements that put new units on our shelves (negative adjustments don't count). */
const ADDING: StockMovementType[] = ['received', 'restocked', 'adjusted'];

async function settings(): Promise<HandlingFeeSettings> {
  const c = await PricingService.getConfig();
  return {
    handlingUnitsPerBlock: c.handlingUnitsPerBlock ?? DEFAULT_HANDLING_FEE.handlingUnitsPerBlock,
    handlingFeePerBlock: c.handlingFeePerBlock ?? DEFAULT_HANDLING_FEE.handlingFeePerBlock,
    handlingFeeDueDays: c.handlingFeeDueDays ?? DEFAULT_HANDLING_FEE.handlingFeeDueDays,
  };
}

const anchorOf = (c: BillingClient) => c.warehousing?.billingAnchor ?? c.warehousing?.enabledAt;

/**
 * Units for one cycle, from the append-only stock history: what was on the
 * shelves at `start` (all movements before it, transfers aside) plus every
 * unit added in [start, end). Units shipped during the cycle still count.
 */
export async function cycleUnits(clientId: Types.ObjectId | string, start: Date, end: Date) {
  const [row] = await StockMovementModel.aggregate<{ carried: number; added: number }>([
    {
      $match: {
        client: new Types.ObjectId(String(clientId)),
        createdAt: { $lt: end },
        type: { $nin: TRANSFERS },
      },
    },
    {
      $group: {
        _id: null,
        carried: { $sum: { $cond: [{ $lt: ['$createdAt', start] }, '$qty', 0] } },
        added: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$createdAt', start] },
                  { $gt: ['$qty', 0] },
                  { $in: ['$type', ADDING] },
                ],
              },
              '$qty',
              0,
            ],
          },
        },
      },
    },
  ]);
  const carriedIn = Math.max(0, row?.carried ?? 0);
  const added = row?.added ?? 0;
  return { carriedIn, added, billed: carriedIn + added };
}

const freePeriodFor = (c: BillingClient, cycle: number) =>
  c.warehousing?.freePeriods?.find((p) => cycle >= p.fromCycle && cycle <= p.toCycle);

function toDto(f: IHandlingFee, now = new Date()): HandlingFeeDto {
  return {
    id: f._id.toString(),
    reference: f.reference,
    cycle: f.cycle,
    periodStart: f.periodStart.toISOString(),
    periodEnd: f.periodEnd.toISOString(),
    units: f.units,
    unitsPerBlock: f.unitsPerBlock,
    pricePerBlock: f.pricePerBlock,
    blocks: f.blocks,
    amount: f.amount,
    listAmount: f.listAmount,
    status: f.status,
    dueAt: f.dueAt?.toISOString() ?? null,
    overdue: f.status === 'due' && !!f.dueAt && f.dueAt < now,
    paidAt: f.paidAt?.toISOString() ?? null,
    note: f.waived?.reason ?? f.freeReason ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}

const isDuplicate = (err: unknown) => (err as { code?: number }).code === 11000;

/** Bills every closed cycle the client hasn't been billed for yet. Safe to run any time. */
async function billClient(client: BillingClient, s: HandlingFeeSettings, now: Date) {
  const anchor = anchorOf(client);
  if (!anchor) return 0;
  const last = await HandlingFeeModel.findOne({ client: client._id }, 'cycle')
    .sort({ cycle: -1 })
    .lean();
  let billed = 0;
  for (let n = (last?.cycle ?? 0) + 1; ; n++) {
    const { start, end } = cycleBounds(anchor, n);
    if (end > now) break;
    const units = await cycleUnits(client._id, start, end);
    // Switched off with nothing left on our shelves: nothing more to bill until it's back on.
    if (units.billed === 0 && !client.warehousing?.enabled) break;

    const price = handlingFeeFor(units.billed, s.handlingUnitsPerBlock, s.handlingFeePerBlock);
    const free = freePeriodFor(client, n);
    const status: HandlingFeeStatus =
      units.billed === 0 ? 'no_stock' : free || price.amount === 0 ? 'free' : 'due';
    try {
      const fee = await HandlingFeeModel.create({
        reference: `HF-${randomCode(8)}`,
        client: client._id,
        cycle: n,
        periodStart: start,
        periodEnd: end,
        units,
        unitsPerBlock: s.handlingUnitsPerBlock,
        pricePerBlock: s.handlingFeePerBlock,
        blocks: price.blocks,
        listAmount: price.amount,
        amount: status === 'due' ? price.amount : 0,
        status,
        // The last moment to pay: the end of the Nth day after the cycle closes.
        dueAt:
          status === 'due' ? new Date(addDays(end, s.handlingFeeDueDays).getTime() - 1) : undefined,
        freeReason: status === 'free' ? free?.reason : undefined,
      });
      bus.emit('handling_fee.billed', { feeId: fee.id });
      billed += 1;
    } catch (err) {
      // Another run billed this cycle first.
      if (!isDuplicate(err)) throw err;
    }
  }
  return billed;
}

async function loadClient(clientId: string) {
  const client = await ClientModel.findById(clientId, 'name contact billing warehousing').lean();
  if (!client) throw notFound('Client not found');
  return client;
}

async function loadFee(feeId: string, clientId?: string) {
  const fee = await HandlingFeeModel.findOne({
    _id: feeId,
    ...(clientId && { client: clientId }),
  }).lean();
  if (!fee) throw notFound('Handling fee not found');
  return fee;
}

async function chargeFor(fee: IHandlingFee) {
  if (fee.status !== 'due') throw conflict('This handling fee is not due', 'FEE_NOT_DUE');
  const client = await loadClient(fee.client.toString());
  return {
    clientId: client._id.toString(),
    handlingFeeId: fee._id.toString(),
    amount: fee.amount,
    customer: {
      name: client.name,
      phone: client.contact.phone,
      email: client.billing?.email ?? client.contact.email,
    },
  };
}

export const HandlingFeesService = {
  settings,

  /** The daily job: bill every client's closed cycles. */
  async billAll(now = new Date()) {
    const s = await settings();
    const clients = await ClientModel.find(
      {
        $or: [
          { 'warehousing.billingAnchor': { $exists: true } },
          { 'warehousing.enabledAt': { $exists: true } },
        ],
      },
      'warehousing',
    ).lean();
    let billed = 0;
    for (const c of clients) billed += await billClient(c, s, now);
    return { clients: clients.length, billed };
  },

  /** What the client sees: closed cycles (billing any that just closed) and the running one. */
  async view(clientId: string, now = new Date()): Promise<HandlingFeesViewDto> {
    const [client, s] = await Promise.all([loadClient(clientId), settings()]);
    await billClient(client, s, now);
    const anchor = anchorOf(client);
    const fees = await HandlingFeeModel.find({ client: clientId })
      .sort({ cycle: -1 })
      .limit(120)
      .lean();

    let current: HandlingFeeEstimateDto | null = null;
    const n = anchor ? cycleAt(anchor, now) : 0;
    if (anchor && n >= 1) {
      const { start, end } = cycleBounds(anchor, n);
      const units = await cycleUnits(clientId, start, end);
      if (client.warehousing?.enabled || units.billed > 0) {
        const price = handlingFeeFor(units.billed, s.handlingUnitsPerBlock, s.handlingFeePerBlock);
        current = {
          cycle: n,
          periodStart: start.toISOString(),
          periodEnd: end.toISOString(),
          units,
          blocks: price.blocks,
          amount: price.amount,
          free: !!freePeriodFor(client, n),
        };
      }
    }

    const due = fees.filter((f) => f.status === 'due');
    const nextDue = due
      .map((f) => f.dueAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      settings: s,
      activatedAt: anchor?.toISOString() ?? null,
      current,
      totalDue: due.reduce((sum, f) => sum + f.amount, 0),
      nextDueAt: nextDue?.toISOString() ?? null,
      fees: fees.map((f) => toDto(f, now)),
    };
  },

  /** Ops view: adds free periods and the next cycles they can make free. */
  async adminView(clientId: string, now = new Date()): Promise<AdminHandlingFeesViewDto> {
    const view = await this.view(clientId, now);
    const client = await ClientModel.findById(clientId, 'warehousing').lean();
    const anchor = client ? anchorOf(client) : undefined;
    const periods = client?.warehousing?.freePeriods ?? [];
    const admins = await AdminModel.find(
      { _id: { $in: periods.map((p) => p.createdBy).filter(Boolean) } },
      'name',
    ).lean();
    const nameOf = new Map(admins.map((a) => [a._id.toString(), a.name]));
    const freePeriods: FreePeriodDto[] = periods.map((p) => ({
      id: p._id.toString(),
      fromCycle: p.fromCycle,
      toCycle: p.toCycle,
      reason: p.reason,
      createdBy: (p.createdBy && nameOf.get(p.createdBy.toString())) ?? null,
      createdAt: p.createdAt.toISOString(),
    }));
    const first = Math.max(view.current?.cycle ?? 1, (view.fees[0]?.cycle ?? 0) + 1);
    const upcoming = anchor
      ? Array.from({ length: 12 }, (_, i) => {
          const n = first + i;
          const { start, end } = cycleBounds(anchor, n);
          return {
            cycle: n,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
            free: freePeriods.some((p) => n >= p.fromCycle && n <= p.toCycle),
          };
        })
      : [];
    return { ...view, freePeriods, upcoming };
  },

  /** For the portal overview card. */
  async summary(clientId: string, now = new Date()) {
    const v = await this.view(clientId, now);
    return {
      current: v.current,
      totalDue: v.totalDue,
      nextDueAt: v.nextDueAt,
      overdue: v.fees.some((f) => f.overdue),
    };
  },

  /** Online checkout for one due cycle; the client comes back to the portal's billing page. */
  async pay(clientId: string, feeId: string) {
    const fee = await loadFee(feeId, clientId);
    return PaymentsService.startClientCheckout(await chargeFor(fee), '/billing');
  },

  /** Staff confirm money that arrived another way (bank transfer). */
  async recordPayment(
    feeId: string,
    adminId: string,
    input: { reference?: string; note?: string },
  ) {
    const fee = await loadFee(feeId);
    await PaymentsService.recordClientManual(await chargeFor(fee), adminId, input);
    return toDto(await loadFee(feeId));
  },

  /** Listener: a payment for this fee succeeded. */
  async markPaid(feeId: string, paymentId: string) {
    await HandlingFeeModel.updateOne(
      { _id: feeId, status: 'due' },
      { status: 'paid', paidAt: new Date(), payment: new Types.ObjectId(paymentId) },
    );
    await PaymentsService.withdrawOpenForFee(feeId);
  },

  /** Cancel a billed cycle. The ledger keeps the charge and posts a matching credit. */
  async waive(feeId: string, adminId: string, reason: string) {
    const fee = await HandlingFeeModel.findOneAndUpdate(
      { _id: feeId, status: 'due' },
      {
        status: 'waived',
        amount: 0,
        dueAt: null,
        waived: { at: new Date(), by: new Types.ObjectId(adminId), reason },
      },
      { new: true },
    ).lean();
    if (!fee) {
      await loadFee(feeId);
      throw conflict('Only a fee that is still due can be waived', 'FEE_NOT_DUE');
    }
    bus.emit('handling_fee.waived', { feeId, adminId });
    await PaymentsService.withdrawOpenForFee(feeId);
    return toDto(fee);
  },

  /** Make upcoming cycles free. Cycles already billed can only be waived. */
  async addFreePeriod(clientId: string, input: FreePeriodInput, adminId: string) {
    const client = await ClientModel.findById(clientId, 'warehousing');
    if (!client) throw notFound('Client not found');
    if (!client.warehousing || !anchorOf(client))
      throw badRequest('Switch warehousing on before giving free time');
    const last = await HandlingFeeModel.findOne({ client: clientId }, 'cycle')
      .sort({ cycle: -1 })
      .lean();
    if (input.fromCycle <= (last?.cycle ?? 0))
      throw badRequest(
        `Month ${input.fromCycle} has already been billed — waive it instead`,
        'CYCLE_BILLED',
      );
    client.warehousing.freePeriods.push({
      fromCycle: input.fromCycle,
      toCycle: input.fromCycle + input.cycles - 1,
      reason: input.reason,
      createdBy: new Types.ObjectId(adminId),
      createdAt: new Date(),
    });
    await client.save();
    return this.adminView(clientId);
  },

  /** Cycles already billed keep their status; only cycles still to come are affected. */
  async removeFreePeriod(clientId: string, periodId: string) {
    const res = await ClientModel.updateOne(
      { _id: clientId },
      { $pull: { 'warehousing.freePeriods': { _id: periodId } } },
    );
    if (!res.matchedCount) throw notFound('Client not found');
    return this.adminView(clientId);
  },

  toDto,
};
