import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { bus } from '../../lib/events';
import { getQueue, startWorker } from '../../lib/queue';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { ShipmentsService } from '../shipments/shipments.service';
import { sms } from './channels/sms';
import { NotificationLogModel } from './models/notification-log.model';
import { templates } from './notifications.templates';

const QUEUE = 'notifications';

type SmsJob = { to: string; body: string; template: string; shipmentId?: string };

const queueSms = (job: SmsJob) => getQueue(QUEUE).add('sms', job);

/**
 * Turns shipment milestones into customer messages. Listeners only decide
 * *what* to send and enqueue it; the worker does the sending with retries,
 * so a slow SMS gateway never slows down a rider's scan.
 */
export function registerNotifications() {
  bus.on('shipment.created', async ({ shipmentId }) => {
    const shipment = await ShipmentModel.findById(shipmentId, 'trackingNumber pickup.phone').lean();
    if (!shipment) return;
    await queueSms({
      to: shipment.pickup.phone,
      body: templates.senderStatus(shipment.trackingNumber, 'created'),
      template: 'sender.created',
      shipmentId,
    });
  });

  bus.on('shipment.status_changed', async ({ shipmentId, to }) => {
    const meta = SHIPMENT_STATUS_META[to];
    if (!meta.notify && !meta.notifyReceiver) return;

    const shipment = await ShipmentModel.findById(
      shipmentId,
      'trackingNumber pickup.phone pickup.contactName dropoff.phone',
    ).lean();
    if (!shipment) return;
    const tn = shipment.trackingNumber;

    if (meta.notify)
      await queueSms({
        to: shipment.pickup.phone,
        body: templates.senderStatus(tn, to),
        template: `sender.${to}`,
        shipmentId,
      });

    if (meta.notifyReceiver) {
      let body: string | null = null;
      if (to === 'picked_up') body = templates.receiverPickedUp(tn, shipment.pickup.contactName);
      if (to === 'out_for_delivery') {
        const pin = await ShipmentsService.deliveryPin(shipmentId);
        if (pin) body = templates.receiverOutForDelivery(tn, pin);
      }
      if (to === 'delivered') body = templates.receiverDelivered(tn);
      if (to === 'delivery_failed') body = templates.receiverFailed(tn);
      if (body)
        await queueSms({
          to: shipment.dropoff.phone,
          body,
          template: `receiver.${to}`,
          shipmentId,
        });
    }
  });

  bus.on('shipment.price_adjusted', async ({ shipmentId, from, to, reason }) => {
    const shipment = await ShipmentModel.findById(shipmentId, 'trackingNumber pickup.phone').lean();
    if (shipment) {
      await queueSms({
        to: shipment.pickup.phone,
        body: templates.priceAdjusted(shipment.trackingNumber, from, to, reason),
        template: 'sender.price_adjusted',
        shipmentId,
      });
    }
  });

  startWorker(QUEUE, async (job) => {
    const data = job.data as SmsJob;
    const log = {
      channel: 'sms' as const,
      to: data.to,
      template: data.template,
      shipment: data.shipmentId,
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
