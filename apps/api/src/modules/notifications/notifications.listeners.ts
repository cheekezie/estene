import { ORDER_STATUS_META } from '@estene/contracts/order-status';
import { bus } from '../../lib/events';
import { getQueue, startWorker } from '../../lib/queue';
import { OrderModel } from '../orders/models/order.model';
import { OrdersService } from '../orders/orders.service';
import { sms } from './channels/sms';
import { NotificationLogModel } from './models/notification-log.model';
import { templates } from './notifications.templates';

const QUEUE = 'notifications';

type SmsJob = { to: string; body: string; template: string; orderId?: string };

const queueSms = (job: SmsJob) => getQueue(QUEUE).add('sms', job);

/**
 * Turns order milestones into customer messages. Listeners only decide
 * *what* to send and enqueue it; the worker does the sending with retries,
 * so a slow SMS gateway never slows down a rider's scan.
 */
export function registerNotifications() {
  bus.on('order.created', async ({ orderId }) => {
    const order = await OrderModel.findById(orderId, 'trackingNumber pickup.phone').lean();
    if (!order) return;
    await queueSms({
      to: order.pickup.phone,
      body: templates.senderStatus(order.trackingNumber, 'created'),
      template: 'sender.created',
      orderId,
    });
  });

  bus.on('order.status_changed', async ({ orderId, to }) => {
    const meta = ORDER_STATUS_META[to];
    if (!meta.notify && !meta.notifyReceiver) return;

    const order = await OrderModel.findById(
      orderId,
      'trackingNumber pickup.phone pickup.contactName dropoff.phone',
    ).lean();
    if (!order) return;
    const tn = order.trackingNumber;

    if (meta.notify)
      await queueSms({
        to: order.pickup.phone,
        body: templates.senderStatus(tn, to),
        template: `sender.${to}`,
        orderId,
      });

    if (meta.notifyReceiver) {
      let body: string | null = null;
      if (to === 'picked_up') body = templates.receiverPickedUp(tn, order.pickup.contactName);
      if (to === 'out_for_delivery') {
        const pin = await OrdersService.deliveryPin(orderId);
        if (pin) body = templates.receiverOutForDelivery(tn, pin);
      }
      if (to === 'delivered') body = templates.receiverDelivered(tn);
      if (to === 'delivery_failed') body = templates.receiverFailed(tn);
      if (body)
        await queueSms({ to: order.dropoff.phone, body, template: `receiver.${to}`, orderId });
    }
  });

  bus.on('order.price_adjusted', async ({ orderId, from, to, reason }) => {
    const order = await OrderModel.findById(orderId, 'trackingNumber pickup.phone').lean();
    if (order) {
      await queueSms({
        to: order.pickup.phone,
        body: templates.priceAdjusted(order.trackingNumber, from, to, reason),
        template: 'sender.price_adjusted',
        orderId,
      });
    }
  });

  startWorker(QUEUE, async (job) => {
    const data = job.data as SmsJob;
    const log = {
      channel: 'sms' as const,
      to: data.to,
      template: data.template,
      order: data.orderId,
      provider: sms.name,
    };
    try {
      await sms.send(data.to, data.body);
      await NotificationLogModel.create({ ...log, status: 'sent' });
    } catch (err) {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt)
        await NotificationLogModel.create({
          ...log,
          status: 'failed',
          error: (err as Error).message,
        });
      throw err;
    }
  });
}
