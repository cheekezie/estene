import { Types, type FilterQuery } from 'mongoose';
import { isPrepaid, type PaymentStatus } from '@estene/contracts/enums';
import type {
  CheckoutSession,
  PaymentPurpose,
  TransactionDetailDto,
  TransactionDto,
  TransactionListQuery,
  TransactionSummaryDto,
} from '@estene/contracts/payment';
import { env } from '../../config/env';
import { randomCode } from '../../lib/crypto';
import { searchRegex } from '../../lib/db';
import { badRequest, notFound } from '../../lib/errors';
import { bus } from '../../lib/events';
import { paginate } from '../../lib/response';
import { ShipmentModel, type ShipmentDoc } from '../shipments/models/shipment.model';
import { payableAmount } from '../shipments/shipments.mapper';
import { ShipmentsService } from '../shipments/shipments.service';
import { PaymentModel, type IPayment, type PaymentDoc } from './models/payment.model';
import { gateway, gatewayFor } from './providers';

/** Unpaid online bookings are cancelled after this long. */
const BOOKING_PAYMENT_WINDOW_MS = 24 * 3_600_000;
const CHECKOUT_TTL_MS = 60 * 60_000;

const newReference = () => `ESP${randomCode(12)}`;

/** Amount still owed on a shipment; negative means we owe a refund. */
export const outstanding = (s: Pick<ShipmentDoc, 'finalAmount' | 'estimate' | 'amountPaid'>) =>
  payableAmount(s) - (s.amountPaid ?? 0);

export function derivePaymentStatus(payable: number, paid: number): PaymentStatus {
  if (paid <= 0) return 'unpaid';
  if (paid < payable) return 'partially_paid';
  return paid > payable ? 'overpaid' : 'paid';
}

const customerOf = (s: ShipmentDoc) => ({
  name: s.pickup.contactName,
  phone: s.pickup.phone,
  email: s.senderEmail,
});

type Ref = {
  _id: Types.ObjectId;
  name?: string;
  firstName?: string;
  lastName?: string;
  trackingNumber?: string;
};
const PAYMENT_POPULATE = [
  { path: 'shipment', select: 'trackingNumber' },
  { path: 'client', select: 'name' },
  { path: 'collectedBy', select: 'firstName lastName' },
  { path: 'recordedBy', select: 'name' },
];

function toDto(p: IPayment): TransactionDto {
  const ship = p.shipment as unknown as Ref | null;
  const client = p.client as unknown as Ref | null;
  const rider = p.collectedBy as unknown as Ref | undefined;
  const admin = p.recordedBy as unknown as Ref | undefined;
  return {
    id: p._id.toString(),
    reference: p.reference,
    shipment: ship?.trackingNumber
      ? { id: ship._id.toString(), trackingNumber: ship.trackingNumber }
      : null,
    client: client?.name ? { id: client._id.toString(), name: client.name } : null,
    customer: p.customer,
    purpose: p.purpose,
    channel: p.channel,
    method: p.method,
    provider: p.provider,
    amount: p.amount,
    status: p.status,
    providerReference: p.providerReference ?? null,
    responseCode: p.responseCode ?? null,
    responseDescription: p.responseDescription ?? null,
    virtualAccount: p.virtualAccount?.accountNumber
      ? { ...p.virtualAccount, expiresAt: p.virtualAccount.expiresAt.toISOString() }
      : null,
    collectedBy: rider?.firstName
      ? { id: rider._id.toString(), name: `${rider.firstName} ${rider.lastName}` }
      : null,
    recordedBy: admin?.name ? { id: admin._id.toString(), name: admin.name } : null,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

async function loadShipment(id: string | Types.ObjectId) {
  const shipment = await ShipmentModel.findById(id);
  if (!shipment) throw notFound('Shipment not found');
  return shipment;
}

/**
 * Recomputes amountPaid/paymentStatus from successful payments and releases
 * a prepaid shipment to dispatch the moment it is fully paid.
 */
async function syncShipment(shipmentId: Types.ObjectId | string) {
  const [agg] = await PaymentModel.aggregate<{ total: number }>([
    { $match: { shipment: new Types.ObjectId(String(shipmentId)), status: 'success' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const shipment = await loadShipment(shipmentId);
  const paid = agg?.total ?? 0;
  shipment.amountPaid = paid;
  shipment.paymentStatus = derivePaymentStatus(payableAmount(shipment), paid);
  await shipment.save();

  // Settled another way (cash, a different checkout): withdraw any open payment requests so
  // the customer can't pay twice into a stale account number.
  if (paid >= payableAmount(shipment)) {
    await PaymentModel.updateMany(
      { shipment: shipment._id, status: 'pending' },
      {
        status: 'expired',
        $push: { events: { type: 'withdrawn', at: new Date(), note: 'Shipment already settled' } },
      },
    );
  }

  if (shipment.status === 'awaiting_payment' && paid >= shipment.estimate.total) {
    await ShipmentsService.transition(
      shipment.id,
      'created',
      { type: 'system' },
      { note: 'Payment confirmed' },
    );
    bus.emit('dispatch.requested', { shipmentId: shipment.id });
  }
}

/** Idempotent: a payment can only become successful once, however many webhooks/requeries race. */
async function markSuccess(
  paymentId: Types.ObjectId,
  details: {
    providerReference?: string;
    responseCode?: string;
    responseDescription?: string;
    note?: string;
  } = {},
) {
  const payment = await PaymentModel.findOneAndUpdate(
    { _id: paymentId, status: { $ne: 'success' } },
    {
      status: 'success',
      paidAt: new Date(),
      ...details,
      $push: {
        events: {
          type: 'success',
          at: new Date(),
          note: details.note ?? details.responseDescription,
        },
      },
    },
    { new: true },
  );
  if (!payment) return null;
  if (payment.shipment) await syncShipment(payment.shipment);
  bus.emit('payment.succeeded', {
    paymentId: payment.id,
    shipmentId: payment.shipment?.toString(),
    handlingFeeId: payment.handlingFee?.toString(),
  });
  return payment;
}

async function createPayment(
  shipment: ShipmentDoc,
  fields: Pick<IPayment, 'purpose' | 'channel' | 'amount'> & Partial<IPayment>,
): Promise<PaymentDoc> {
  return PaymentModel.create({
    reference: newReference(),
    shipment: shipment._id,
    client: shipment.client ?? null,
    method: shipment.paymentMethod,
    provider: fields.channel === 'cash' || fields.channel === 'manual' ? 'offline' : gateway.name,
    customer: customerOf(shipment),
    events: [{ type: 'created', at: new Date() }],
    ...fields,
  });
}

/** What a business client pays for that isn't a shipment (a handling-fee cycle). */
export type ClientCharge = {
  clientId: string;
  handlingFeeId: string;
  amount: number;
  customer: { name: string; phone: string; email: string };
};

export const PaymentsService = {
  outstanding,

  /**
   * Hosted checkout for a client charge. Reuses a live checkout for the same
   * charge, so clicking "Pay" twice can't open two payments.
   */
  async startClientCheckout(charge: ClientCharge, returnPath: string): Promise<CheckoutSession> {
    const live = await PaymentModel.findOne({
      handlingFee: charge.handlingFeeId,
      channel: 'checkout',
      status: 'pending',
      amount: charge.amount,
      provider: gateway.name,
      checkoutUrl: { $exists: true },
      expiresAt: { $gt: new Date(Date.now() + 5 * 60_000) },
    });
    if (live)
      return {
        reference: live.reference,
        amount: live.amount,
        provider: gateway.name,
        checkoutUrl: live.checkoutUrl!,
      };
    const payment = await PaymentModel.create({
      reference: newReference(),
      client: charge.clientId,
      handlingFee: charge.handlingFeeId,
      purpose: 'handling_fee',
      channel: 'checkout',
      method: 'online',
      provider: gateway.name,
      amount: charge.amount,
      customer: charge.customer,
      events: [{ type: 'created', at: new Date() }],
      expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
    });
    const sep = returnPath.includes('?') ? '&' : '?';
    const session = await gateway.checkoutSession({
      reference: payment.reference,
      amount: charge.amount,
      customer: charge.customer,
      returnUrl: `${env.PORTAL_URL}${returnPath}${sep}ref=${payment.reference}`,
    });
    payment.checkoutUrl = session.checkoutUrl;
    if (session.providerReference) payment.providerReference = session.providerReference;
    await payment.save();
    return {
      reference: session.reference,
      amount: session.amount,
      provider: session.provider,
      checkoutUrl: session.checkoutUrl,
    };
  },

  /** Staff confirm a client charge paid outside the gateway (a transfer to our account). */
  async recordClientManual(
    charge: Omit<ClientCharge, 'customer'> & { customer: ClientCharge['customer'] },
    adminId: string,
    input: { note?: string; reference?: string },
  ) {
    const payment = await PaymentModel.create({
      reference: newReference(),
      client: charge.clientId,
      handlingFee: charge.handlingFeeId,
      purpose: 'handling_fee',
      channel: 'manual',
      method: 'transfer',
      provider: 'offline',
      amount: charge.amount,
      customer: charge.customer,
      recordedBy: new Types.ObjectId(adminId),
      note: input.note,
      providerReference: input.reference,
      events: [{ type: 'created', at: new Date() }],
    });
    await markSuccess(payment._id, { note: input.note ?? 'Recorded by staff' });
    return payment;
  },

  /** The client's own payment, re-checked with the gateway (after the checkout redirect). */
  async verifyForClient(clientId: string, reference: string) {
    const payment = await PaymentModel.findOne({ reference, client: clientId }, '_id').lean();
    if (!payment) throw notFound('Payment not found');
    const p = await this.verify(reference);
    return { reference, status: p?.status ?? 'pending' };
  },

  /** A charge was settled: withdraw its other open checkouts so the client can't pay twice. */
  async withdrawOpenForFee(handlingFeeId: string) {
    await PaymentModel.updateMany(
      { handlingFee: handlingFeeId, status: 'pending' },
      {
        status: 'expired',
        $push: { events: { type: 'withdrawn', at: new Date(), note: 'Fee already settled' } },
      },
    );
  },

  /** Hosted checkout for whatever is still owed (the booking, or a top-up after re-pricing). */
  async startCheckout(shipmentId: string, purpose?: PaymentPurpose): Promise<CheckoutSession> {
    const shipment = await loadShipment(shipmentId);
    const amount = outstanding(shipment);
    if (amount <= 0) throw badRequest('Nothing to pay on this shipment', 'NOTHING_DUE');
    const payment = await createPayment(shipment, {
      purpose: purpose ?? (shipment.status === 'awaiting_payment' ? 'booking' : 'balance'),
      channel: 'checkout',
      amount,
      expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
    });
    const session = await gateway.checkoutSession({
      reference: payment.reference,
      amount,
      customer: {
        ...customerOf(shipment),
        email:
          shipment.senderEmail ?? `${shipment.trackingNumber.toLowerCase()}@customers.estene.ng`,
      },
      returnUrl: `${env.PUBLIC_SITE_URL}/pay/return?ref=${payment.reference}`,
    });
    payment.checkoutUrl = session.checkoutUrl;
    if (session.providerReference) payment.providerReference = session.providerReference;
    await payment.save();
    return {
      reference: session.reference,
      amount: session.amount,
      provider: session.provider,
      checkoutUrl: session.checkoutUrl,
    };
  },

  /** A dedicated account number the customer transfers the outstanding amount into. Reuses a live one. */
  async startTransfer(shipmentId: string, purpose?: PaymentPurpose) {
    const shipment = await loadShipment(shipmentId);
    const amount = outstanding(shipment);
    if (amount <= 0) throw badRequest('Nothing to pay on this shipment', 'NOTHING_DUE');

    const live = await PaymentModel.findOne({
      shipment: shipment._id,
      channel: 'virtual_account',
      status: 'pending',
      amount,
      expiresAt: { $gt: new Date() },
    });
    if (live) return toDto(live);

    if (!gateway.createVirtualAccount)
      throw badRequest(
        'Bank transfer happens inside the online checkout with our payment provider — send the customer a pay link instead',
        'TRANSFER_VIA_CHECKOUT',
      );
    const reference = newReference();
    const account = await gateway.createVirtualAccount({
      reference,
      amount,
      accountName: `Estene ${shipment.trackingNumber}`,
      customer: {
        ...customerOf(shipment),
        email:
          shipment.senderEmail ?? `${shipment.trackingNumber.toLowerCase()}@customers.estene.ng`,
      },
    });
    const payment = await createPayment(shipment, {
      reference,
      purpose: purpose ?? (shipment.status === 'awaiting_payment' ? 'booking' : 'balance'),
      channel: 'virtual_account',
      amount,
      virtualAccount: { ...account, expiresAt: new Date(account.expiresAt) },
      expiresAt: new Date(account.expiresAt),
    });
    return toDto(payment);
  },

  /** Whether this gateway can issue one-off account numbers; otherwise transfers go through checkout. */
  get issuesAccountNumbers() {
    return !!gateway.createVirtualAccount;
  },

  /**
   * Starts a prepaid booking's payment the way the customer asked: an account
   * number for `transfer` when the gateway issues them, otherwise a hosted
   * checkout (which itself offers bank transfer, card and USSD).
   */
  async startPayment(
    shipmentId: string,
    preferred: 'transfer' | 'checkout',
    purpose?: PaymentPurpose,
  ) {
    return preferred === 'transfer' && this.issuesAccountNumbers
      ? { transfer: await this.startTransfer(shipmentId, purpose) }
      : { checkout: await this.startCheckout(shipmentId, purpose) };
  },

  /** Asks the gateway for the authoritative status. Never trusts redirects or webhook bodies alone. */
  async verify(reference: string) {
    const payment = await PaymentModel.findOne({ reference });
    if (!payment) throw notFound('Payment not found');
    if (payment.status !== 'pending' || payment.provider === 'offline') return payment;

    // The gateway it started on, even if PAYMENTS_PROVIDER has since changed.
    const started = gatewayFor(payment.provider);
    if (!started) return payment; // old gateway's key removed — left pending for a manual check
    const result = await started.verify({
      reference,
      providerReference: payment.providerReference,
      amount: payment.amount,
    });
    if (result.status === 'success') {
      if (result.amountPaid < payment.amount) {
        await PaymentModel.updateOne(
          { _id: payment._id },
          {
            $push: {
              events: {
                type: 'underpaid',
                at: new Date(),
                note: `Gateway reported ${result.amountPaid}`,
              },
            },
          },
        );
        return payment;
      }
      return (
        (await markSuccess(payment._id, {
          providerReference: result.providerReference,
          responseCode: result.responseCode,
          responseDescription: result.responseDescription,
        })) ?? payment
      );
    }
    if (result.status === 'failed') {
      return PaymentModel.findOneAndUpdate(
        { _id: payment._id, status: 'pending' },
        {
          status: 'failed',
          responseCode: result.responseCode,
          responseDescription: result.responseDescription,
          $push: { events: { type: 'failed', at: new Date(), note: result.responseDescription } },
        },
        { new: true },
      );
    }
    if (payment.expiresAt && payment.expiresAt < new Date()) {
      return PaymentModel.findOneAndUpdate(
        { _id: payment._id, status: 'pending' },
        { status: 'expired', $push: { events: { type: 'expired', at: new Date() } } },
        { new: true },
      );
    }
    return payment;
  },

  /** Rider took cash from the customer for whatever is outstanding (or a given amount). */
  async recordCash(shipmentId: string, riderId: string, amount?: number) {
    const shipment = await loadShipment(shipmentId);
    const due = amount ?? outstanding(shipment);
    if (due <= 0) return null;
    const payment = await createPayment(shipment, {
      purpose: shipment.amountPaid > 0 ? 'balance' : 'booking',
      channel: 'cash',
      amount: due,
      collectedBy: new Types.ObjectId(riderId),
    });
    return markSuccess(payment._id, { note: 'Cash collected by rider' });
  },

  /** Staff confirm money that arrived outside the gateway (bank transfer to our account, client invoice settled). */
  async recordManual(
    shipmentId: string,
    adminId: string,
    input: { amount?: number; note?: string; reference?: string },
  ) {
    const shipment = await loadShipment(shipmentId);
    const amount = input.amount ?? outstanding(shipment);
    if (amount <= 0) throw badRequest('Nothing outstanding on this shipment', 'NOTHING_DUE');
    const payment = await createPayment(shipment, {
      purpose: shipment.amountPaid > 0 ? 'balance' : 'booking',
      channel: 'manual',
      amount,
      recordedBy: new Types.ObjectId(adminId),
      note: input.note,
      providerReference: input.reference,
    });
    await markSuccess(payment._id, { note: input.note ?? 'Recorded by staff' });
    return toDto((await PaymentModel.findById(payment._id).populate(PAYMENT_POPULATE))!);
  },

  /** After the rider re-prices a prepaid shipment upward: issue an account number for the difference. */
  async requestBalance(shipmentId: string) {
    const shipment = await loadShipment(shipmentId);
    if (!isPrepaid(shipment.paymentMethod) || outstanding(shipment) <= 0) return null;
    if (this.issuesAccountNumbers) {
      const payment = await this.startTransfer(shipmentId, 'balance');
      bus.emit('payment.balance_requested', { paymentId: payment.id, shipmentId });
      return payment;
    }
    // No account numbers: the sender gets a link to pay the difference online.
    const session = await this.startCheckout(shipmentId, 'balance');
    const payment = await PaymentModel.findOne({ reference: session.reference }, '_id').lean();
    if (payment)
      bus.emit('payment.balance_requested', { paymentId: payment._id.toString(), shipmentId });
    return null;
  },

  /** For the public tracking page: what's owed and the live account number, if any. */
  async publicDue(shipment: ShipmentDoc) {
    const due = outstanding(shipment);
    if (
      due <= 0 ||
      ['cancelled', 'returned'].includes(shipment.status) ||
      !isPrepaid(shipment.paymentMethod)
    )
      return undefined;
    const va = await PaymentModel.findOne({
      shipment: shipment._id,
      channel: 'virtual_account',
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    return {
      balanceDue: due,
      reason:
        shipment.amountPaid > 0 || shipment.adjustment?.at
          ? ('price_adjusted' as const)
          : ('booking' as const),
      virtualAccount: va?.virtualAccount
        ? { ...va.virtualAccount, expiresAt: va.virtualAccount.expiresAt.toISOString() }
        : null,
    };
  },

  async listForShipment(shipmentId: string) {
    const rows = await PaymentModel.find({ shipment: shipmentId })
      .populate(PAYMENT_POPULATE)
      .sort({ createdAt: -1 });
    return rows.map(toDto);
  },

  async list(q: TransactionListQuery) {
    const filter = await this.filter(q);
    const [rows, total] = await Promise.all([
      PaymentModel.find(filter)
        .populate(PAYMENT_POPULATE)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      PaymentModel.countDocuments(filter),
    ]);
    return paginate(rows.map(toDto), total, q.page, q.limit);
  },

  async summary(q: TransactionListQuery): Promise<TransactionSummaryDto> {
    const filter = await this.filter({ ...q, status: undefined });
    const rows = await PaymentModel.aggregate<{ _id: string; n: number; sum: number }>([
      { $match: filter },
      { $group: { _id: '$status', n: { $sum: 1 }, sum: { $sum: '$amount' } } },
    ]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r]));
    return {
      count: rows.reduce((a, r) => a + r.n, 0),
      successful: by.success?.n ?? 0,
      collected: by.success?.sum ?? 0,
      pending: by.pending?.n ?? 0,
      failed: (by.failed?.n ?? 0) + (by.expired?.n ?? 0),
    };
  },

  async filter(q: Partial<TransactionListQuery>): Promise<FilterQuery<IPayment>> {
    const filter: FilterQuery<IPayment> = {};
    if (q.status) filter.status = q.status;
    if (q.channel) filter.channel = q.channel;
    if (q.shipmentId) filter.shipment = new Types.ObjectId(q.shipmentId);
    if (q.from || q.to)
      filter.createdAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
    if (q.search) {
      const rx = searchRegex(q.search);
      const shipments = await ShipmentModel.find({ trackingNumber: rx }, '_id').limit(50).lean();
      filter.$or = [
        { reference: rx },
        { providerReference: rx },
        { 'customer.name': rx },
        { 'customer.phone': rx },
        { shipment: { $in: shipments.map((s) => s._id) } },
      ];
    }
    return filter;
  },

  async get(id: string): Promise<TransactionDetailDto> {
    const p = await PaymentModel.findById(id).populate(PAYMENT_POPULATE);
    if (!p) throw notFound('Transaction not found');
    return {
      ...toDto(p),
      events: p.events.map((e) => ({ type: e.type, at: e.at.toISOString(), note: e.note ?? null })),
    };
  },

  async requery(id: string) {
    const p = await PaymentModel.findById(id);
    if (!p) throw notFound('Transaction not found');
    await PaymentModel.updateOne(
      { _id: p._id },
      { $push: { events: { type: 'requery', at: new Date() } } },
    );
    await this.verify(p.reference);
    return this.get(id);
  },

  /**
   * Safety net for missed webhooks and abandoned checkouts: re-checks pending
   * gateway payments and cancels prepaid bookings left unpaid for 24h.
   */
  async reconcile() {
    const pending = await PaymentModel.find(
      {
        status: 'pending',
        provider: { $ne: 'offline' },
        createdAt: { $gt: new Date(Date.now() - 3 * 86_400_000) },
      },
      'reference',
    ).limit(200);
    for (const p of pending)
      await this.verify(p.reference).catch((err) =>
        console.error('[payments] verify failed', p.reference, err.message),
      );

    const stale = await ShipmentModel.find(
      {
        status: 'awaiting_payment',
        createdAt: { $lt: new Date(Date.now() - BOOKING_PAYMENT_WINDOW_MS) },
      },
      '_id',
    );
    for (const s of stale) {
      await ShipmentsService.transition(
        s.id,
        'cancelled',
        { type: 'system' },
        { note: 'Payment not received within 24 hours' },
      ).catch(() => undefined);
    }
  },
};
