import { Types } from 'mongoose';
import type { LedgerEntryType } from '@estene/contracts/enums';
import { bankName } from '@estene/contracts/banks';
import type {
  BankAccountInput,
  CreatePayoutInput,
  PayoutDto,
  RiderEarningsDto,
} from '@estene/contracts/payout';
import { randomCode } from '../../lib/crypto';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { getQueue } from '../../lib/queue';
import { redis } from '../../lib/redis';
import { paginate } from '../../lib/response';
import { FinanceService } from '../finance/finance.service';
import { LedgerEntryModel } from '../finance/models/ledger-entry.model';
import { gateway } from '../payments/providers';
import { RiderModel } from '../riders/models/rider.model';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { PayoutModel, type IPayout } from './models/payout.model';

export const PAYOUT_QUEUE = 'payouts';
const LOCK_TTL_S = 30;

type Ref = {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  code?: string;
  name?: string;
};

const toDto = (p: IPayout): PayoutDto => {
  const rider = p.rider as unknown as Ref;
  const admin = p.initiatedBy as unknown as Ref | undefined;
  return {
    id: p._id.toString(),
    reference: p.reference,
    rider: {
      id: rider._id.toString(),
      name: `${rider.firstName ?? ''} ${rider.lastName ?? ''}`.trim(),
      code: rider.code ?? '',
    },
    amount: p.amount,
    method: p.method,
    status: p.status,
    bankAccount: p.bankAccount?.accountNumber ? { ...p.bankAccount } : null,
    providerReference: p.providerReference ?? null,
    failureReason: p.failureReason ?? null,
    note: p.note ?? null,
    initiatedBy: admin?.name ? { id: admin._id.toString(), name: admin.name } : null,
    completedAt: p.completedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
};
const POPULATE = [
  { path: 'rider', select: 'firstName lastName code' },
  { path: 'initiatedBy', select: 'name' },
];

/** Per-rider earnings position from the ledger, plus trips and in-flight payouts. */
async function computeEarnings(riderIds?: Types.ObjectId[]): Promise<RiderEarningsDto[]> {
  const match = riderIds ? { rider: { $in: riderIds } } : { rider: { $exists: true } };
  const [ledger, trips, pending, riders] = await Promise.all([
    LedgerEntryModel.aggregate<{
      _id: { rider: Types.ObjectId; type: LedgerEntryType };
      total: number;
    }>([
      {
        $match: {
          ...match,
          type: {
            $in: ['rider_earning', 'payout', 'cash_collected', 'cash_remitted', 'platform_revenue'],
          },
        },
      },
      { $group: { _id: { rider: '$rider', type: '$type' }, total: { $sum: '$amount' } } },
    ]),
    ShipmentModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      {
        $match: {
          status: 'delivered',
          ...(riderIds ? { rider: { $in: riderIds } } : { rider: { $ne: null } }),
        },
      },
      { $group: { _id: '$rider', n: { $sum: 1 } } },
    ]),
    PayoutModel.aggregate<{ _id: Types.ObjectId; total: number }>([
      {
        $match: {
          status: { $in: ['pending', 'processing'] },
          ...(riderIds && { rider: { $in: riderIds } }),
        },
      },
      { $group: { _id: '$rider', total: { $sum: '$amount' } } },
    ]),
    RiderModel.find(
      riderIds ? { _id: { $in: riderIds } } : { status: { $ne: 'pending' } },
      'firstName lastName code type bankAccount',
    ).lean(),
  ]);

  const totals = new Map<string, Partial<Record<LedgerEntryType, number>>>();
  for (const row of ledger) {
    const key = row._id.rider.toString();
    totals.set(key, { ...totals.get(key), [row._id.type]: row.total });
  }
  const tripsBy = new Map(trips.map((t) => [t._id.toString(), t.n]));
  const pendingBy = new Map(pending.map((p) => [p._id.toString(), p.total]));

  return riders
    .map((r) => {
      const id = r._id.toString();
      const t = totals.get(id) ?? {};
      const earnings = t.rider_earning ?? 0;
      const commission = r.type === 'partner' ? (t.platform_revenue ?? 0) : 0;
      const paidOut = t.payout ?? 0;
      const pendingPayouts = pendingBy.get(id) ?? 0;
      const cashHeld = (t.cash_collected ?? 0) - (t.cash_remitted ?? 0);
      return {
        riderId: id,
        name: `${r.firstName} ${r.lastName}`,
        code: r.code,
        type: r.type,
        deliveredTrips: tripsBy.get(id) ?? 0,
        grossFares: earnings + commission,
        commission,
        earnings,
        paidOut,
        pendingPayouts,
        cashHeld,
        available: earnings - paidOut - pendingPayouts - cashHeld,
        bankAccount: r.bankAccount?.accountNumber
          ? { ...r.bankAccount, verifiedAt: r.bankAccount.verifiedAt.toISOString() }
          : null,
      };
    })
    .sort((a, b) => b.available - a.available || b.deliveredTrips - a.deliveredTrips);
}

/** Serialises payouts per rider so two clicks can't both spend the same balance. */
async function withRiderLock<T>(riderId: string, fn: () => Promise<T>): Promise<T> {
  const key = `lock:payout:${riderId}`;
  if (!(await redis.set(key, '1', 'EX', LOCK_TTL_S, 'NX')))
    throw conflict('A payout for this rider is already being created — try again in a moment');
  try {
    return await fn();
  } finally {
    await redis.del(key);
  }
}

export const PayoutsService = {
  earnings: () => computeEarnings(),

  async riderEarnings(riderId: string) {
    const [row] = await computeEarnings([new Types.ObjectId(riderId)]);
    if (!row) throw notFound('Rider not found');
    return row;
  },

  /** Verifies the account name with the bank before saving — payouts never go to an unchecked account. */
  async setBankAccount(riderId: string, input: BankAccountInput) {
    const rider = await RiderModel.findById(riderId);
    if (!rider) throw notFound('Rider not found');
    const { accountName } = await gateway.nameEnquiry(input).catch(() => {
      throw badRequest('The bank could not confirm this account number', 'ACCOUNT_NOT_FOUND');
    });
    rider.bankAccount = {
      ...input,
      bankName: bankName(input.bankCode),
      accountName,
      verifiedAt: new Date(),
    };
    await rider.save();
    return { ...rider.bankAccount, verifiedAt: rider.bankAccount.verifiedAt.toISOString() };
  },

  async create(input: CreatePayoutInput, adminId: string) {
    return withRiderLock(input.riderId, async () => {
      const rider = await RiderModel.findById(input.riderId, 'type bankAccount firstName');
      if (!rider) throw notFound('Rider not found');
      if (rider.type !== 'partner') throw badRequest('Company riders are paid through payroll');
      const position = await this.riderEarnings(input.riderId);
      if (input.amount > position.available) {
        throw badRequest(
          `Only ${(position.available / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })} is available to pay out`,
          'INSUFFICIENT_BALANCE',
        );
      }
      if (input.method === 'transfer' && !rider.bankAccount?.accountNumber) {
        throw badRequest(
          `Add ${rider.firstName}'s bank account before paying out`,
          'NO_BANK_ACCOUNT',
        );
      }

      const payout = await PayoutModel.create({
        reference: `ESO${randomCode(12)}`,
        rider: rider._id,
        amount: input.amount,
        method: input.method,
        note: input.note,
        providerReference: input.reference,
        initiatedBy: adminId,
        bankAccount: rider.bankAccount
          ? {
              bankCode: rider.bankAccount.bankCode,
              bankName: rider.bankAccount.bankName,
              accountNumber: rider.bankAccount.accountNumber,
              accountName: rider.bankAccount.accountName,
            }
          : undefined,
        status: input.method === 'manual' ? 'success' : 'pending',
        completedAt: input.method === 'manual' ? new Date() : undefined,
      });

      if (input.method === 'manual') await FinanceService.recordPayout(payout.id);
      else await getQueue(PAYOUT_QUEUE).add('send', { payoutId: payout.id }, { jobId: payout.id });
      return this.get(payout.id);
    });
  },

  /** Pays every selected partner rider their full available balance (skips anyone without one or a bank account). */
  async bulk(riderIds: string[], adminId: string) {
    const rows = await computeEarnings(riderIds.map((id) => new Types.ObjectId(id)));
    const results: {
      riderId: string;
      name: string;
      status: 'queued' | 'skipped';
      reason?: string;
      amount?: number;
    }[] = [];
    for (const r of rows) {
      if (r.type !== 'partner')
        results.push({
          riderId: r.riderId,
          name: r.name,
          status: 'skipped',
          reason: 'Company rider',
        });
      else if (r.available <= 0)
        results.push({
          riderId: r.riderId,
          name: r.name,
          status: 'skipped',
          reason: 'Nothing available',
        });
      else if (!r.bankAccount)
        results.push({
          riderId: r.riderId,
          name: r.name,
          status: 'skipped',
          reason: 'No bank account',
        });
      else {
        try {
          await this.create(
            { riderId: r.riderId, amount: r.available, method: 'transfer' },
            adminId,
          );
          results.push({ riderId: r.riderId, name: r.name, status: 'queued', amount: r.available });
        } catch (err) {
          results.push({
            riderId: r.riderId,
            name: r.name,
            status: 'skipped',
            reason: (err as Error).message,
          });
        }
      }
    }
    return results;
  },

  /** Worker: one transfer attempt. Only a confirmed success touches the ledger. */
  async process(payoutId: string) {
    const payout = await PayoutModel.findOneAndUpdate(
      { _id: payoutId, status: 'pending' },
      { status: 'processing', $inc: { attempts: 1 } },
      { new: true },
    );
    if (!payout?.bankAccount) return;
    const result = await gateway.transfer({
      reference: payout.reference,
      amount: payout.amount,
      bankCode: payout.bankAccount.bankCode,
      accountNumber: payout.bankAccount.accountNumber,
      accountName: payout.bankAccount.accountName,
      narration: `Estene payout ${payout.reference}`,
    });
    if (result.status === 'success') {
      await PayoutModel.updateOne(
        { _id: payout._id },
        {
          status: 'success',
          providerReference: result.providerReference,
          completedAt: new Date(),
          failureReason: null,
        },
      );
      await FinanceService.recordPayout(payout.id);
    } else if (result.status === 'failed') {
      await PayoutModel.updateOne(
        { _id: payout._id },
        { status: 'failed', failureReason: result.message ?? 'Transfer failed' },
      );
    }
    // `pending`: stays processing until the gateway's status check/webhook settles it.
  },

  async retry(payoutId: string) {
    const payout = await PayoutModel.findOneAndUpdate(
      { _id: payoutId, status: 'failed' },
      { status: 'pending', failureReason: null },
      { new: true },
    );
    if (!payout) throw badRequest('Only failed payouts can be retried');
    await getQueue(PAYOUT_QUEUE).add(
      'send',
      { payoutId },
      { jobId: `${payoutId}:${payout.attempts + 1}` },
    );
    return this.get(payoutId);
  },

  async list(q: { page: number; limit: number; status?: string; riderId?: string }) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.riderId) filter.rider = q.riderId;
    const [rows, total] = await Promise.all([
      PayoutModel.find(filter)
        .populate(POPULATE)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      PayoutModel.countDocuments(filter),
    ]);
    return paginate(rows.map(toDto), total, q.page, q.limit);
  },

  async get(id: string) {
    const p = await PayoutModel.findById(id).populate(POPULATE);
    if (!p) throw notFound('Payout not found');
    return toDto(p);
  },
};
