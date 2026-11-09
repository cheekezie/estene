import { bus } from '../../lib/events';
import { getQueue, startWorker } from '../../lib/queue';
import { HandlingFeesService } from './handling-fees.service';

const QUEUE = 'handling-fees';

export function registerHandlingFees() {
  bus.on('payment.succeeded', async ({ paymentId, handlingFeeId }) => {
    if (handlingFeeId) await HandlingFeesService.markPaid(handlingFeeId, paymentId);
  });

  // Cycles end on any day of the month (they follow each client's activation date), so bill
  // daily at 01:00 Lagos. Opening a client's fees in the admin or portal also bills on the spot.
  const queue = getQueue(QUEUE);
  void queue.upsertJobScheduler(
    'daily-handling-fees',
    { pattern: '0 1 * * *', tz: 'Africa/Lagos' },
    { name: 'bill' },
  );
  startWorker(
    QUEUE,
    async () => {
      const r = await HandlingFeesService.billAll();
      if (r.billed) console.log(`[handling-fees] billed ${r.billed} cycle(s)`);
    },
    1,
  );

  // The flat monthly storage fee it replaces.
  void getQueue('warehousing-billing')
    .removeJobScheduler('monthly-storage-fees')
    .catch(() => undefined);
}
