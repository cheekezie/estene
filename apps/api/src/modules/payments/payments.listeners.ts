import { bus } from '../../lib/events';
import { getQueue, startWorker } from '../../lib/queue';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { PaymentsService } from './payments.service';

const QUEUE = 'payments';

/**
 * Turns shipment milestones into money events:
 *   - cash methods: the rider collects at pickup / delivery
 *   - prepaid methods re-priced upward: issue an account number for the difference
 * plus a recurring reconciliation sweep against the gateway.
 */
export function registerPayments() {
  bus.on('shipment.status_changed', async ({ shipmentId, to }) => {
    if (to !== 'picked_up' && to !== 'delivered') return;
    const s = await ShipmentModel.findById(shipmentId, 'paymentMethod rider').lean();
    if (!s?.rider) return;
    const collectNow =
      (to === 'picked_up' && s.paymentMethod === 'cash_on_pickup') ||
      (to === 'delivered' && s.paymentMethod === 'cash_on_delivery');
    if (collectNow) await PaymentsService.recordCash(shipmentId, s.rider.toString());
  });

  bus.on('shipment.price_adjusted', ({ shipmentId }) =>
    PaymentsService.requestBalance(shipmentId).then(() => undefined),
  );

  startWorker(QUEUE, () => PaymentsService.reconcile(), 1);
  // Repeatable job — BullMQ dedupes on the repeat key, so every API instance can register it safely.
  void getQueue(QUEUE).add(
    'reconcile',
    {},
    { repeat: { every: 2 * 60_000 }, jobId: 'payments-reconcile' },
  );
}
