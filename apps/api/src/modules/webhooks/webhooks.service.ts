import { Types, type FilterQuery } from 'mongoose';
import type {
  WebhookDeliveryDetailDto,
  WebhookDeliveryDto,
  WebhookEnvelope,
} from '@estene/contracts/client';
import type {
  ShipmentWebhookEvent,
  WarehouseWebhookEvent,
  WebhookEvent,
} from '@estene/contracts/enums';
import { webhookEventTitle } from '@estene/contracts/webhook-events';
import { decrypt, randomCode } from '../../lib/crypto';
import { searchRegex } from '../../lib/db';
import { badRequest, notFound } from '../../lib/errors';
import { getQueue } from '../../lib/queue';
import { paginate } from '../../lib/response';
import { ClientModel, type IClient } from '../clients/models/client.model';
import { toIntegrationShipmentDto } from '../integration/integration.mapper';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { SHIPMENT_POPULATE } from '../shipments/shipments.mapper';
import { WebhookDeliveryModel, type IWebhookDelivery } from './models/webhook-delivery.model';
import { signPayload } from './webhooks.signing';
import { summarize, type SummaryExtra } from './webhooks.summary';
import { assertSafeWebhookUrl } from './webhooks.url-guard';

export const WEBHOOK_QUEUE = 'webhooks';
/** 8 attempts with exponential backoff from 30s ≈ retries spread over ~1 hour. */
const RETRY = { attempts: 8, backoff: { type: 'exponential' as const, delay: 30_000 } };
const TIMEOUT_MS = 10_000;
const RESPONSE_SNIPPET_BYTES = 1024;

const eventId = () => `evt_${randomCode(20).toLowerCase()}`;
const iso = (d?: Date) => d?.toISOString() ?? null;

const toDto = (d: IWebhookDelivery): WebhookDeliveryDto => ({
  id: d._id.toString(),
  eventId: d.eventId,
  type: d.type as WebhookDeliveryDto['type'],
  title: d.title ?? webhookEventTitle(d.type),
  summary: d.summary ?? '',
  trackingNumber: d.trackingNumber ?? null,
  status: d.status,
  attempts: d.attempts,
  lastStatusCode: d.lastStatusCode ?? null,
  lastError: d.lastError ?? null,
  lastDurationMs: d.lastDurationMs ?? null,
  lastAttemptAt: iso(d.lastAttemptAt),
  createdAt: d.createdAt.toISOString(),
  deliveredAt: iso(d.deliveredAt),
});

async function enqueue(
  client: Pick<IClient, '_id' | 'webhook'>,
  type: WebhookEvent | 'ping',
  summary: string,
  data: unknown,
  shipment?: { id: string; trackingNumber: string },
) {
  if (!client.webhook) return null;
  const envelope: WebhookEnvelope<unknown> = {
    id: eventId(),
    type,
    title: webhookEventTitle(type),
    summary,
    createdAt: new Date().toISOString(),
    data,
  };
  const delivery = await WebhookDeliveryModel.create({
    client: client._id,
    eventId: envelope.id,
    type,
    title: envelope.title,
    summary,
    shipment: shipment?.id,
    trackingNumber: shipment?.trackingNumber,
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

async function readSnippet(res: Response) {
  try {
    const text = await res.text();
    return text.length > RESPONSE_SNIPPET_BYTES
      ? `${text.slice(0, RESPONSE_SNIPPET_BYTES)}…`
      : text;
  } catch {
    return undefined;
  }
}

export const WebhooksService = {
  /** Called from domain-event listeners. A no-op unless the shipment belongs to a subscribed client. */
  async notifyShipmentEvent(
    type: ShipmentWebhookEvent,
    shipmentId: string,
    extra: Record<string, unknown> = {},
  ) {
    const clientId = (await ShipmentModel.findById(shipmentId, 'client').lean())?.client;
    if (!clientId) return;
    const client = await ClientModel.findOne({ _id: clientId, status: 'active' }, 'webhook');
    if (!client?.webhook?.isActive || !client.webhook.events.includes(type)) return;

    const shipment = await ShipmentModel.findById(shipmentId).populate(SHIPMENT_POPULATE);
    if (!shipment) return;
    const dto = toIntegrationShipmentDto(shipment);
    await enqueue(
      client,
      type,
      summarize(type, dto, extra as SummaryExtra),
      { shipment: dto, ...extra },
      {
        id: shipment.id,
        trackingNumber: shipment.trackingNumber,
      },
    );
  },

  /**
   * Warehousing events (orders, inbounds, stock). `build` runs only when the
   * client is subscribed, so unsubscribed clients cost one lookup.
   */
  async notifyClientEvent(
    type: WarehouseWebhookEvent,
    clientId: string,
    build: () => Promise<{ summary: string; data: Record<string, unknown> } | null>,
  ) {
    const client = await ClientModel.findOne({ _id: clientId, status: 'active' }, 'webhook');
    if (!client?.webhook?.isActive || !client.webhook.events.includes(type)) return;
    const payload = await build();
    if (payload) await enqueue(client, type, payload.summary, payload.data);
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

    const startedAt = Date.now();
    let statusCode: number | undefined;
    let responseBody: string | undefined;
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
      responseBody = await readSnippet(res);
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
        lastStatusCode: statusCode ?? null,
        lastError: error ?? null,
        lastResponseBody: responseBody ?? null,
        lastDurationMs: Date.now() - startedAt,
        lastAttemptAt: new Date(),
        ...(error
          ? isFinalAttempt
            ? { status: 'failed' }
            : {}
          : { status: 'delivered', deliveredAt: new Date() }),
      },
    );
    if (error) throw new Error(error);
  },

  /** Full, filterable delivery history for one client (rows expire after 30 days). */
  async list(
    clientId: string,
    q: { page: number; limit: number; status?: string; type?: string; search?: string },
  ) {
    const filter: FilterQuery<IWebhookDelivery> = { client: clientId };
    if (q.status) filter.status = q.status;
    if (q.type) filter.type = q.type;
    if (q.search) {
      const rx = searchRegex(q.search);
      filter.$or = [{ trackingNumber: rx }, { eventId: rx }, { summary: rx }];
    }
    const [rows, total] = await Promise.all([
      WebhookDeliveryModel.find(filter, '-body -lastResponseBody')
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      WebhookDeliveryModel.countDocuments(filter),
    ]);
    return paginate(rows.map(toDto), total, q.page, q.limit);
  },

  async get(clientId: string, deliveryId: string): Promise<WebhookDeliveryDetailDto> {
    const d = await WebhookDeliveryModel.findOne({ _id: deliveryId, client: clientId });
    if (!d) throw notFound('Delivery not found');
    return {
      ...toDto(d),
      url: d.url,
      payload: JSON.parse(d.body),
      lastResponseBody: d.lastResponseBody ?? null,
    };
  },

  /** Last-24h health for the developer page header. */
  async stats(clientId: string) {
    const since = new Date(Date.now() - 86_400_000);
    const rows = await WebhookDeliveryModel.aggregate<{ _id: string; n: number }>([
      { $match: { client: new Types.ObjectId(clientId), createdAt: { $gte: since } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
    return { delivered: by.delivered ?? 0, failed: by.failed ?? 0, pending: by.pending ?? 0 };
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
    const delivery = await enqueue(
      client,
      'ping',
      'Test event from Estene — your endpoint is reachable and verifying signatures.',
      {
        message: 'Webhook test from Estene',
      },
    );
    return delivery ? toDto(delivery) : null;
  },
};
