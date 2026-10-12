import type { FastifyInstance } from 'fastify';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { PaginationQuerySchema } from '@estene/contracts/common';
import { ORDER_STATUSES } from '@estene/contracts/enums';
import { ApiCreateOrderSchema, QuoteRequestSchema } from '@estene/contracts/order';
import { notFound } from '../../lib/errors';
import { paginate, parse, send } from '../../lib/response';
import { OrderModel, type IOrder } from '../orders/models/order.model';
import { ORDER_POPULATE } from '../orders/orders.mapper';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { ZonesService } from '../zones/zones.service';
import { authenticateApiKey, perKeyRateLimit } from './integration.auth';
import { toIntegrationOrderDto } from './integration.mapper';

const OrderRef = z.object({ ref: z.string().trim().min(6).max(64) });
const ListQuery = PaginationQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  externalReference: z.string().trim().max(64).optional(),
});

/**
 * Versioned integration API for business clients (docs/integrations.md).
 * Every query is scoped to the calling client — an order id from another
 * client is simply "not found".
 */
export async function integrationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticateApiKey);

  /** Accepts our id, our tracking number, or the client's own reference. */
  const findOwnOrder = async (clientId: string, ref: string) => {
    const or: FilterQuery<IOrder>[] = [
      { trackingNumber: ref.toUpperCase() },
      { externalReference: ref },
    ];
    if (/^[a-f\d]{24}$/i.test(ref)) or.push({ _id: ref });
    const order = await OrderModel.findOne({ client: clientId, $or: or }).populate(ORDER_POPULATE);
    if (!order) throw notFound('Order not found');
    return order;
  };

  app.get('/zones', { config: perKeyRateLimit(60) }, async (_req, reply) => {
    const zones = await ZonesService.list({ activeOnly: true });
    return send(
      reply,
      zones.map(({ id, code, name, areas }) => ({ id, code, name, areas })),
    );
  });

  app.post('/quotes', { config: perKeyRateLimit(120) }, async (req, reply) => {
    const { lines, total } = await PricingService.quote(parse(QuoteRequestSchema, req.body));
    return send(reply, { lines, total, currency: 'NGN' });
  });

  app.post('/orders', { config: perKeyRateLimit(60) }, async (req, reply) => {
    const { externalReference, ...input } = parse(ApiCreateOrderSchema, req.body);
    const { order, created } = await OrdersService.create(
      input,
      { type: 'client', id: req.apiClient.clientId },
      { source: 'api', clientId: req.apiClient.clientId, externalReference },
    );
    // 200 on an idempotent replay so integrators can tell it apart from a fresh create.
    return send(
      reply,
      toIntegrationOrderDto(order),
      created ? 201 : 200,
      created ? 'Order created' : 'Order already exists for this externalReference',
    );
  });

  app.get('/orders', { config: perKeyRateLimit(120) }, async (req, reply) => {
    const q = parse(ListQuery, req.query);
    const filter: FilterQuery<IOrder> = { client: req.apiClient.clientId };
    if (q.status) filter.status = q.status;
    if (q.externalReference) filter.externalReference = q.externalReference;
    const [orders, total] = await Promise.all([
      OrderModel.find(filter)
        .populate(ORDER_POPULATE)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      OrderModel.countDocuments(filter),
    ]);
    return send(reply, paginate(orders.map(toIntegrationOrderDto), total, q.page, q.limit));
  });

  app.get('/orders/:ref', { config: perKeyRateLimit(300) }, async (req, reply) => {
    const { ref } = parse(OrderRef, req.params);
    return send(reply, toIntegrationOrderDto(await findOwnOrder(req.apiClient.clientId, ref)));
  });

  /** Allowed until a rider is on the way to pickup (enforced by the order state machine). */
  app.post('/orders/:ref/cancel', { config: perKeyRateLimit(60) }, async (req, reply) => {
    const { ref } = parse(OrderRef, req.params);
    const { reason } = parse(
      z.object({ reason: z.string().trim().max(300).optional() }),
      req.body ?? {},
    );
    const order = await findOwnOrder(req.apiClient.clientId, ref);
    await OrdersService.cancel(order.id, { type: 'client', id: req.apiClient.clientId }, reason);
    return send(
      reply,
      toIntegrationOrderDto(await findOwnOrder(req.apiClient.clientId, order.id)),
      200,
      'Order cancelled',
    );
  });
}
