import { bus } from '../../lib/events';
import { startWorker } from '../../lib/queue';
import { WEBHOOK_QUEUE, WebhooksService } from './webhooks.service';

export function registerWebhooks() {
  bus.on('order.created', ({ orderId }) =>
    WebhooksService.notifyOrderEvent('order.created', orderId),
  );
  bus.on('order.status_changed', ({ orderId, from, to }) =>
    WebhooksService.notifyOrderEvent('order.status_changed', orderId, {
      previousStatus: from,
      status: to,
    }),
  );
  bus.on('order.price_adjusted', ({ orderId, from, to, reason }) =>
    WebhooksService.notifyOrderEvent('order.price_adjusted', orderId, {
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
