import { webhookEventForStatus } from '@estene/contracts/webhook-events';
import { bus } from '../../lib/events';
import { startWorker } from '../../lib/queue';
import { WEBHOOK_QUEUE, WebhooksService } from './webhooks.service';

/** Internal domain events → the public, one-event-per-milestone webhook vocabulary. */
export function registerWebhooks() {
  bus.on('shipment.created', ({ shipmentId }) =>
    WebhooksService.notifyShipmentEvent('shipment.created', shipmentId),
  );

  bus.on('shipment.status_changed', async ({ shipmentId, from, to }) => {
    const event = webhookEventForStatus(from, to);
    if (event)
      await WebhooksService.notifyShipmentEvent(event, shipmentId, {
        previousStatus: from,
        status: to,
      });
  });

  bus.on('shipment.price_adjusted', ({ shipmentId, from, to, reason }) =>
    WebhooksService.notifyShipmentEvent('shipment.price_adjusted', shipmentId, {
      previousAmount: from,
      amount: to,
      reason: reason ?? null,
    }),
  );

  startWorker(
    WEBHOOK_QUEUE,
    async (job) => {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await WebhooksService.attempt(job.data.deliveryId, isFinalAttempt);
    },
    10,
  );
}
