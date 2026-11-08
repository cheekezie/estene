import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PaginationQuerySchema } from '@estene/contracts/common';
import {
  INBOUND_STATUSES,
  InboundCreateSchema,
  ORDER_STATUSES,
  OrderCreateSchema,
  ProductInputSchema,
  ProductUpdateSchema,
} from '@estene/contracts/warehouse';
import { parse, send } from '../../lib/response';
import { perKeyRateLimit } from '../integration/integration.auth';
import { StockLevelModel } from './models/stock-level.model';
import { ProductModel } from './models/product.model';
import { OrdersService } from './orders.service';
import {
  STOCK_POPULATE,
  toIntegrationInboundDto,
  toIntegrationOrderDto,
  toIntegrationStockDto,
  toProductDto,
} from './warehousing.mapper';
import { warehousingClient, WarehousingService } from './warehousing.service';

const Ref = z.object({ ref: z.string().trim().min(1).max(64) });
const ReasonBody = z.object({ reason: z.string().trim().max(300).optional() });

/**
 * Warehousing endpoints on the integration API (docs/integrations.md).
 * Registered inside `integrationRoutes`, so the API key is already verified;
 * every query here is scoped to `req.apiClient.clientId`.
 */
export async function warehousingIntegrationRoutes(app: FastifyInstance) {
  const clientOf = async (req: FastifyRequest) => {
    await warehousingClient(req.apiClient.clientId);
    return req.apiClient.clientId;
  };
  const actor = (req: FastifyRequest) => ({ type: 'client' as const, id: req.apiClient.clientId });

  // ── Products ──
  app.get('/products', { config: perKeyRateLimit(120) }, async (req, reply) => {
    const q = parse(
      PaginationQuerySchema.extend({ active: z.enum(['true', 'false']).optional() }),
      req.query,
    );
    return send(reply, await WarehousingService.listProducts(await clientOf(req), q));
  });
  app.post('/products', { config: perKeyRateLimit(60) }, async (req, reply) =>
    send(
      reply,
      await WarehousingService.createProduct(
        await clientOf(req),
        parse(ProductInputSchema, req.body),
      ),
      201,
      'Product created',
    ),
  );
  app.get('/products/:ref', { config: perKeyRateLimit(300) }, async (req, reply) =>
    send(
      reply,
      toProductDto(
        await WarehousingService.getProduct(await clientOf(req), parse(Ref, req.params).ref),
      ),
    ),
  );
  app.patch('/products/:ref', { config: perKeyRateLimit(60) }, async (req, reply) =>
    send(
      reply,
      await WarehousingService.updateProduct(
        await clientOf(req),
        parse(Ref, req.params).ref,
        parse(ProductUpdateSchema, req.body),
      ),
      200,
      'Product updated',
    ),
  );

  // ── Stock ──
  app.get('/stock', { config: perKeyRateLimit(120) }, async (req, reply) => {
    const clientId = await clientOf(req);
    const { sku } = parse(z.object({ sku: z.string().trim().max(64).optional() }), req.query);
    const product = sku
      ? await ProductModel.findOne({ client: clientId, sku }, '_id').lean()
      : null;
    const rows = await StockLevelModel.find({
      client: clientId,
      ...(sku && { product: product?._id ?? null }),
    })
      .populate(STOCK_POPULATE)
      .lean();
    return send(reply, rows.map(toIntegrationStockDto));
  });

  // ── Inbound ──
  app.get('/inbounds', { config: perKeyRateLimit(120) }, async (req, reply) => {
    const q = parse(
      PaginationQuerySchema.extend({ status: z.enum(INBOUND_STATUSES).optional() }),
      req.query,
    );
    const page = await WarehousingService.listInbounds({ ...q, clientId: await clientOf(req) });
    return send(reply, { ...page, items: page.items.map(toIntegrationInboundDto) });
  });
  app.post('/inbounds', { config: perKeyRateLimit(60) }, async (req, reply) => {
    const { inbound, created } = await WarehousingService.createInbound(
      await clientOf(req),
      parse(InboundCreateSchema, req.body),
    );
    return send(
      reply,
      toIntegrationInboundDto(inbound),
      created ? 201 : 200,
      created ? 'Inbound created' : 'Inbound already exists for this reference',
    );
  });
  app.get('/inbounds/:ref', { config: perKeyRateLimit(300) }, async (req, reply) =>
    send(
      reply,
      toIntegrationInboundDto(
        await WarehousingService.findInbound(parse(Ref, req.params).ref, await clientOf(req)),
      ),
    ),
  );
  app.post('/inbounds/:ref/cancel', { config: perKeyRateLimit(60) }, async (req, reply) =>
    send(
      reply,
      toIntegrationInboundDto(
        await WarehousingService.cancelInbound(parse(Ref, req.params).ref, await clientOf(req)),
      ),
      200,
      'Inbound cancelled',
    ),
  );

  // ── Orders ──
  app.get('/orders', { config: perKeyRateLimit(120) }, async (req, reply) => {
    const q = parse(
      PaginationQuerySchema.extend({
        status: z.enum(ORDER_STATUSES).optional(),
        reference: z.string().trim().max(64).optional(),
      }),
      req.query,
    );
    const page = await OrdersService.list({ ...q, clientId: await clientOf(req) });
    return send(reply, { ...page, items: page.items.map(toIntegrationOrderDto) });
  });
  app.post('/orders', { config: perKeyRateLimit(60) }, async (req, reply) => {
    const { order, created } = await OrdersService.create(
      await clientOf(req),
      parse(OrderCreateSchema, req.body),
      actor(req),
      'api',
    );
    return send(
      reply,
      toIntegrationOrderDto(order),
      created ? 201 : 200,
      created ? 'Order created' : 'Order already exists for this reference',
    );
  });
  app.get('/orders/:ref', { config: perKeyRateLimit(300) }, async (req, reply) =>
    send(
      reply,
      toIntegrationOrderDto(
        await OrdersService.find(parse(Ref, req.params).ref, await clientOf(req)),
      ),
    ),
  );
  /** Allowed until packed, or after packing while the parcel is still at the warehouse with no rider. */
  app.post('/orders/:ref/cancel', { config: perKeyRateLimit(60) }, async (req, reply) => {
    const { reason } = parse(ReasonBody, req.body ?? {});
    const order = await OrdersService.cancel(
      parse(Ref, req.params).ref,
      actor(req),
      reason,
      await clientOf(req),
    );
    return send(reply, toIntegrationOrderDto(order), 200, 'Order cancelled');
  });
}
