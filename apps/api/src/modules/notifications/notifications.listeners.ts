import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { bus } from '../../lib/events';
import { getQueue, startWorker } from '../../lib/queue';
import { ClientModel } from '../clients/models/client.model';
import { OfficeModel } from '../offices/models/office.model';
import { StockLevelModel } from '../warehousing/models/stock-level.model';
import { PaymentModel } from '../payments/models/payment.model';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { ShipmentsService } from '../shipments/shipments.service';
import type { RiderPushData } from '@estene/contracts/rider';
import { RiderModel } from '../riders/models/rider.model';
import { DispatchOfferModel } from '../dispatch/models/dispatch-offer.model';
import { sendPush, type PushMessage } from './channels/push';
import { sms } from './channels/sms';
import { NotificationLogModel } from './models/notification-log.model';
import { templates } from './notifications.templates';

const QUEUE = 'notifications';

type SmsJob = { to: string; body: string; template: string; shipmentId?: string };

const queueSms = (job: SmsJob) => getQueue(QUEUE).add('sms', job);

/** Pushes to riders are time-critical (a 45-second offer), so they get their own queue. */
const PUSH_QUEUE = 'push';
type PushJob = { riderId: string; messages: PushMessage[] };

/**
 * Turns shipment milestones into customer messages. Listeners only decide
 * *what* to send and enqueue it; the worker does the sending with retries,
 * so a slow SMS gateway never slows down a rider's scan.
 */
export function registerNotifications() {
  // Phone bookings paid by transfer/online: send the payment details.
  bus.on('payment.link_requested', async ({ shipmentId }) => {
    const shipment = await ShipmentModel.findById(
      shipmentId,
      'trackingNumber pickup.phone paymentMethod',
    ).lean();
    if (!shipment) return;
    const va = await PaymentModel.findOne({
      shipment: shipmentId,
      channel: 'virtual_account',
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .lean();
    const body =
      shipment.paymentMethod === 'transfer' && va?.virtualAccount
        ? templates.payByTransfer(shipment.trackingNumber, va.amount, va.virtualAccount)
        : templates.payOnline(shipment.trackingNumber);
    await queueSms({
      to: shipment.pickup.phone,
      body,
      template: 'sender.payment_request',
      shipmentId,
    });
  });

  bus.on('payment.balance_requested', async ({ paymentId, shipmentId }) => {
    const [shipment, payment] = await Promise.all([
      ShipmentModel.findById(shipmentId, 'trackingNumber pickup.phone').lean(),
      PaymentModel.findById(paymentId).lean(),
    ]);
    if (!shipment || !payment) return;
    await queueSms({
      to: shipment.pickup.phone,
      body: payment.virtualAccount
        ? templates.balanceDue(shipment.trackingNumber, payment.amount, payment.virtualAccount)
        : templates.balanceDueOnline(shipment.trackingNumber, payment.amount),
      template: 'sender.balance_due',
      shipmentId,
    });
  });

  bus.on('shipment.created', async ({ shipmentId }) => {
    const shipment = await ShipmentModel.findById(
      shipmentId,
      'trackingNumber pickup.phone status',
    ).lean();
    // Prepaid bookings get their "Booked" SMS once payment clears (see status_changed below).
    if (!shipment || shipment.status === 'awaiting_payment') return;
    await queueSms({
      to: shipment.pickup.phone,
      body: templates.senderStatus(shipment.trackingNumber, 'created'),
      template: 'sender.created',
      shipmentId,
    });
  });

  bus.on('shipment.status_changed', async ({ shipmentId, from, to }) => {
    const meta = SHIPMENT_STATUS_META[to];
    if (!meta.notify && !meta.notifyReceiver) return;
    // Back to "created" means either payment cleared (announce the booking) or a rider
    // was swapped (internal — the sender hears when the new rider accepts).
    if (to === 'created' && from !== 'awaiting_payment') return;

    const shipment = await ShipmentModel.findById(
      shipmentId,
      'trackingNumber pickup.phone pickup.contactName dropoff.phone currentOffice fulfilment',
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

    // A drop-off at the counter is the recipient's "picked up" moment.
    const droppedOff = to === 'at_hub' && from === 'created';
    if (meta.notifyReceiver || droppedOff) {
      let body: string | null = null;
      if (droppedOff) body = templates.receiverPickedUp(tn, shipment.pickup.contactName);
      if (to === 'ready_for_collection' && shipment.currentOffice) {
        const [office, pin] = await Promise.all([
          OfficeModel.findById(shipment.currentOffice, 'name address openingHours').lean(),
          ShipmentsService.deliveryPin(shipmentId),
        ]);
        if (office && pin) body = templates.receiverReadyForCollection(tn, office, pin);
      }
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

  // Warehousing clients hear about low stock on their contact number (the webhook covers integrators).
  bus.on('stock.low', async ({ clientId, productId, officeId }) => {
    const [client, level] = await Promise.all([
      ClientModel.findById(clientId, 'contact.phone status').lean(),
      StockLevelModel.findOne({ product: productId, office: officeId })
        .populate<{ product: { sku: string; name: string } }>('product', 'sku name')
        .populate<{ office: { code: string } }>('office', 'code')
        .lean(),
    ]);
    if (client?.status !== 'active' || !level) return;
    await queueSms({
      to: client.contact.phone,
      body: templates.lowStock(
        level.product.name,
        level.product.sku,
        level.onHand - level.reserved,
        level.office.code,
      ),
      template: 'client.low_stock',
    });
  });

  // A job offer: wake the rider's phone. The app also polls while it's open.
  bus.on('dispatch.offered', async ({ shipmentId, riderId, offerId, expiresAt }) => {
    const [rider, shipment, offer] = await Promise.all([
      RiderModel.findById(riderId, '+pushTokens').lean(),
      ShipmentModel.findById(shipmentId, 'pickup.area dropoff.area').lean(),
      DispatchOfferModel.findById(offerId, 'rank').lean(),
    ]);
    if (!rider?.pushTokens?.length || !shipment) return;
    const ttl = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    const distance = offer?.rank?.distanceKm;
    const data: RiderPushData = { type: 'offer', offerId, shipmentId };
    const messages = rider.pushTokens.map((t) => ({
      to: t.token,
      title: 'New delivery job',
      body:
        `${shipment.pickup?.area ?? 'Pickup'} → ${shipment.dropoff?.area ?? 'Drop-off'}` +
        (distance != null ? ` · ${distance.toFixed(1)} km away` : '') +
        ` · accept within ${ttl}s`,
      data,
      channelId: 'offers',
      sound: 'default' as const,
      priority: 'high' as const,
      ttl,
    }));
    await getQueue(PUSH_QUEUE).add('offer', { riderId, messages } satisfies PushJob, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 2000 },
      removeOnComplete: true,
    });
  });

  startWorker(PUSH_QUEUE, async (job) => {
    const { riderId, messages } = job.data as PushJob;
    const { deadTokens } = await sendPush(messages);
    // Uninstalled app or revoked permission: stop pushing to that phone.
    if (deadTokens.length)
      await RiderModel.updateOne(
        { _id: riderId },
        { $pull: { pushTokens: { token: { $in: deadTokens } } } },
      );
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
