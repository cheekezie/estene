import { bus } from '../../lib/events';
import { getQueue, startWorker } from '../../lib/queue';
import { previousMonth } from './billing.months';
import { WarehousingBillingService } from './billing.service';
import { OrdersService } from './orders.service';

const BILLING_QUEUE = 'warehousing-billing';

export function registerWarehousing() {
  bus.on('shipment.status_changed', ({ shipmentId, to }) =>
    OrdersService.syncFromShipment(shipmentId, to),
  );

  bus.on('stock.available', ({ clientId, officeId }) =>
    OrdersService.retryBackorders(clientId, officeId),
  );

  // 01:00 Lagos on the 1st: bill last month's storage. Repeatable jobs are de-duplicated by BullMQ.
  void getQueue(BILLING_QUEUE).upsertJobScheduler(
    'monthly-storage-fees',
    { pattern: '0 1 1 * *', tz: 'Africa/Lagos' },
    { name: 'storage-fees' },
  );
  startWorker(
    BILLING_QUEUE,
    async () => {
      await WarehousingBillingService.postStorageFees(previousMonth());
    },
    1,
  );
}
