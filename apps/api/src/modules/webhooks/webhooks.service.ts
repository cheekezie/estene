import type { WebhookDeliveryDto, WebhookEnvelope } from '@estene/contracts/client';
import type { WebhookEvent } from '@estene/contracts/enums';
import { decrypt, randomCode } from '../../lib/crypto';
import { badRequest, notFound } from '../../lib/errors';
import { getQueue } from '../../lib/queue';
import { ClientModel, type IClient } from '../clients/models/client.model';
import { toIntegrationOrderDto } from '../integration/integration.mapper';
import { OrderModel } from '../orders/models/order.model';
import { ORDER_POPULATE } from '../orders/orders.mapper';
import { WebhookDeliveryModel, type IWebhookDelivery } from './models/webhook-delivery.model';
import { signPayload } from './webhooks.signing';
import { assertSafeWebhookUrl } from './webhooks.url-guard';

export const WEBHOOK_QUEUE = 'webhooks';
/** 8 attempts with exponential backoff from 30s ≈ retries spread over ~1 hour. */
const RETRY = { attempts: 8, backoff: { type: 'exponential' as const, delay: 30_000 } };
const TIMEOUT_MS = 10_000;

const eventId = () => `evt_${randomCode(20).toLowerCase()}`;

const toDto = (d: IWebhookDelivery): WebhookDeliveryDto => ({
  id: d._id.toString(),
  eventId: d.eventId,
  type: d.type as WebhookDeliveryDto['type'],
  trackingNumber: d.trackingNumber ?? null,
  status: d.status,
  attempts: d.attempts,
  lastStatusCode: d.lastStatusCode ?? null,
  lastError: d.lastError ?? null,
  createdAt: d.createdAt.toISOString(),
  deliveredAt: d.deliveredAt?.toISOString() ?? null,
});

async function enqueue(
  client: Pick<IClient, '_id' | 'webhook'>,
  type: WebhookEvent | 'ping',
  data: unknown,
  order?: { id: string; trackingNumber: string },
) {
  if (!client.webhook) return null;
  const envelope: WebhookEnvelope<unknown> = {
    id: eventId(),
    type,
    createdAt: new Date().toISOString(),
    data,
  };
  const delivery = await WebhookDeliveryModel.create({
    client: client._id,
    eventId: envelope.id,
    type,
    order: order?.id,
    trackingNumber: order?.trackingNumber,
    url: client.webhook.url,
    body: JSON.stringify(envelope),
  });
  await queueDelivery(delivery.id);
  return delivery;
}

/** One queue job per delivery (jobId = delivery id), so a resend replaces pending retries instead of racing them. */
async function queueDelivery(deliveryId: string) {
  const queue = getQueue(WEBHOOK_QUEUE);
  const existing = await queue.getJob(deliveryId);
  if (existing && !(await existing.isActive())) await existing.remove();
  await queue.add('deliver', { deliveryId }, { ...RETRY, jobId: deliveryId });
}

export const WebhooksService = {
  /** Called from domain-event listeners. A no-op unless the order belongs to a subscribed client. */
  async notifyOrderEvent(type: WebhookEvent, orderId: string, extra?: Record<string, unknown>) {
    const clientId = (await OrderModel.findById(orderId, 'client').lean())?.client;
    if (!clientId) return;
    const client = await ClientModel.findOne({ _id: clientId, status: 'active' }, 'webhook');
    const order = await OrderModel.findById(orderId).populate(ORDER_POPULATE);
    if (!order) return;
    if (!client?.webhook?.isActive || !client.webhook.events.includes(type)) return;
    await enqueue(
      client,
      type,
      { order: toIntegrationOrderDto(order), ...extra },
      { id: order.id, trackingNumber: order.trackingNumber },
    );
  },

  /** Worker: one HTTP attempt. Throwing hands the retry back to BullMQ. */
  async attempt(deliveryId: string, isFinalAttempt: boolean) {
    const delivery = await WebhookDeliveryModel.findById(deliveryId);
    if (!delivery || delivery.status === 'delivered') return;
    const client = await ClientModel.findById(delivery.client, 'webhook status');
    if (!client?.webhook || client.status !== 'active') {
      await WebhookDeliveryModel.updateOne(
        { _id: deliveryId },
        { status: 'failed', lastError: 'Webhook disabled or client suspended' },
      );
      return;
    }

    let statusCode: number | undefined;
    let error: string | undefined;
    try {
      await assertSafeWebhookUrl(delivery.url);
      const res = await fetch(delivery.url, {
        method: 'POST',
        redirect: 'manual', // a redirect could point anywhere — treat it as a failure
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Estene-Webhooks/1.0',
          'Estene-Event': delivery.type,
          'Estene-Delivery': delivery.eventId,
          'Estene-Signature': signPayload(decrypt(client.webhook.secretCipher), delivery.body),
        },
        body: delivery.body,
      });
      statusCode = res.status;
      if (!res.ok) error = `Endpoint responded ${res.status}`;
    } catch (err) {
      error =
        (err as Error).name === 'TimeoutError'
          ? `No response within ${TIMEOUT_MS / 1000}s`
          : (err as Error).message;
    }

    await WebhookDeliveryModel.updateOne(
      { _id: deliveryId },
      {
        $inc: { attempts: 1 },
        lastStatusCode: statusCode,
        lastError: error ?? null,
        ...(error
          ? isFinalAttempt
            ? { status: 'failed' }
            : {}
          : { status: 'delivered', deliveredAt: new Date() }),
      },
    );
    if (error) throw new Error(error);
  },

  async list(clientId: string, limit = 50) {
    const rows = await WebhookDeliveryModel.find({ client: clientId })
      .sort({ createdAt: -1 })
      .limit(limit);
    return rows.map(toDto);
  },

  /** Re-sends the identical body (fresh signature) to the client's *current* URL — e.g. after they fixed their endpoint. */
  async resend(clientId: string, deliveryId: string) {
    const client = await ClientModel.findById(clientId, 'webhook');
    if (!client?.webhook) throw badRequest('Set a webhook URL first');
    const delivery = await WebhookDeliveryModel.findOneAndUpdate(
      { _id: deliveryId, client: clientId },
      { status: 'pending', lastError: null, url: client.webhook.url },
      { new: true },
    );
    if (!delivery) throw notFound('Delivery not found');
    await queueDelivery(deliveryId);
    return toDto(delivery);
  },

  async sendTest(clientId: string) {
    const client = await ClientModel.findById(clientId, 'webhook');
    if (!client?.webhook) throw badRequest('Set a webhook URL first');
    const delivery = await enqueue(client, 'ping', { message: 'Webhook test from Estene' });
    return delivery ? toDto(delivery) : null;
  },
};
