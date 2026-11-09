import { bus } from '../../lib/events';
import { HandlingFeeModel } from '../handling-fees/models/handling-fee.model';
import { FinanceService } from './finance.service';

const fmtDay = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  });
/** "8 Nov 2026 – 7 Dec 2026": the end is exclusive, so show the day before. */
const periodLabel = (start: Date, end: Date) =>
  `${fmtDay(start)} – ${fmtDay(new Date(end.getTime() - 1))}`;

export function registerFinance() {
  bus.on('payment.succeeded', ({ paymentId }) => FinanceService.recordPayment(paymentId));

  // A charge only for cycles that were billed (not free, not empty). Keyed per fee.
  bus.on('handling_fee.billed', async ({ feeId }) => {
    const f = await HandlingFeeModel.findById(feeId).lean();
    if (!f || f.listAmount <= 0 || f.status === 'free' || f.status === 'no_stock') return;
    await FinanceService.recordHandlingFee({
      id: feeId,
      clientId: f.client.toString(),
      amount: f.listAmount,
      reference: f.reference,
      note: `Month ${f.cycle}: ${periodLabel(f.periodStart, f.periodEnd)} · ${f.units.billed} units`,
    });
  });

  bus.on('handling_fee.waived', async ({ feeId, adminId }) => {
    const f = await HandlingFeeModel.findById(feeId).lean();
    if (!f || f.status !== 'waived') return;
    await FinanceService.recordFeeWaived({
      id: feeId,
      clientId: f.client.toString(),
      amount: f.listAmount,
      reference: f.reference,
      reason: f.waived?.reason ?? 'Waived',
      adminId,
    });
  });

  bus.on('shipment.status_changed', async ({ shipmentId, to }) => {
    if (to === 'delivered' || to === 'collected') await FinanceService.recordDelivery(shipmentId);
  });
}
