import type { WarehouseWebhookEvent } from '@estene/contracts/enums';
import type { OrderStatus } from '@estene/contracts/warehouse';
import { webhookEventForStatus } from '@estene/contracts/webhook-events';
import { bus } from '../../lib/events';
import { startWorker } from '../../lib/queue';
import { InboundModel } from '../warehousing/models/inbound.model';
import { OrderModel } from '../warehousing/models/order.model';
import { StockLevelModel } from '../warehousing/models/stock-level.model';
import {
  INBOUND_POPULATE,
  ORDER_POPULATE,
  STOCK_POPULATE,
  toIntegrationInboundDto,
  toIntegrationOrderDto,
  toIntegrationStockDto,
} from '../warehousing/warehousing.mapper';
import { WEBHOOK_QUEUE, WebhooksService } from './webhooks.service';
import { summarizeInbound, summarizeLowStock, summarizeOrder } from './webhooks.summary';

type OrderEvent = Extract<WarehouseWebhookEvent, `order.${string}`>;

/** Which order transitions integrators hear about. Picking is internal. */
function orderEventFor(from: OrderStatus, to: OrderStatus): OrderEvent | null {
  if (to === 'ready_to_pick') return from === 'awaiting_stock' ? 'order.stock_reserved' : null;
  const map: Partial<Record<OrderStatus, OrderEvent>> = {
    shipped: 'order.shipped',
    delivered: 'order.delivered',
    returned: 'order.returned',
    cancelled: 'order.cancelled',
  };
  return map[to] ?? null;
}

async function notifyOrder(type: OrderEvent, orderId: string) {
  const clientId = (await OrderModel.findById(orderId, 'client').lean())?.client;
  if (!clientId) return;
  await WebhooksService.notifyClientEvent(type, clientId.toString(), async () => {
    const order = await OrderModel.findById(orderId).populate(ORDER_POPULATE);
    if (!order) return null;
    const dto = toIntegrationOrderDto(order);
    return { summary: summarizeOrder(type, dto), data: { order: dto } };
  });
}

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

  // ── Warehousing ──
  bus.on('order.created', ({ orderId }) => notifyOrder('order.created', orderId));
  bus.on('order.status_changed', async ({ orderId, from, to }) => {
    const event = orderEventFor(from, to);
    if (event) await notifyOrder(event, orderId);
  });
  bus.on('inbound.received', async ({ inboundId }) => {
    const clientId = (await InboundModel.findById(inboundId, 'client').lean())?.client;
    if (!clientId) return;
    await WebhooksService.notifyClientEvent('inbound.received', clientId.toString(), async () => {
      const inbound = await InboundModel.findById(inboundId).populate(INBOUND_POPULATE);
      if (!inbound) return null;
      const dto = toIntegrationInboundDto(inbound);
      return { summary: summarizeInbound(dto), data: { inbound: dto } };
    });
  });
  bus.on('stock.low', ({ clientId, productId, officeId }) =>
    WebhooksService.notifyClientEvent('stock.low', clientId, async () => {
      const level = await StockLevelModel.findOne({ product: productId, office: officeId })
        .populate(STOCK_POPULATE)
        .lean();
      if (!level) return null;
      const dto = toIntegrationStockDto(level);
      return { summary: summarizeLowStock(dto), data: { stock: dto } };
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
