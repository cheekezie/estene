import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import {
  AdminInboundCreateSchema,
  AdminOrderCreateSchema,
  InboundListQuerySchema,
  InboundReceiveSchema,
  MovementQuerySchema,
  OrderListQuerySchema,
  OrderPackSchema,
  OrderRestockSchema,
  ProductInputSchema,
  ProductListQuerySchema,
  ProductUpdateSchema,
  SetBinSchema,
  StockAdjustSchema,
  StockQuerySchema,
  StockTransferSchema,
  WarehousingSettingsSchema,
} from '@estene/contracts/warehouse';
import { badRequest, notFound } from '../../lib/errors';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { assertOfficeAccess } from '../office-ops/office-ops.service';
import { ProductModel } from './models/product.model';
import { OrdersService } from './orders.service';
import { StockService } from './stock.service';
import { TransfersService } from './transfers.service';
import { toInboundDto, toOrderDto } from './warehousing.mapper';
import { WarehousingService } from './warehousing.service';

const IdParams = z.object({ id: ObjectIdSchema });
const ReasonBody = z.object({ reason: z.string().trim().max(300).optional() });

/**
 * Warehousing back office: client settings, catalogue, stock, inbound
 * receiving and the order queue. Office agents act only at their own office.
 */
export async function warehousingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  const ops = { preHandler: requireRole('ops_manager', 'office_agent', 'support') };
  const floor = { preHandler: requireRole('ops_manager', 'office_agent') };
  const manage = { preHandler: requireRole('ops_manager') };

  const id = (req: FastifyRequest) => parse(IdParams, req.params).id;
  const actor = (req: FastifyRequest) => ({
    type: 'admin' as const,
    id: req.user.sub,
    // Office agents are pinned to their office; everyone else may act anywhere.
    officeId: req.user.role === 'office_agent' ? req.user.officeId : undefined,
  });
  /** Office agents see their own warehouse unless they ask for a client. */
  const scopeOffice = <T extends { officeId?: string; clientId?: string }>(
    req: FastifyRequest,
    q: T,
  ) => {
    if (q.officeId) assertOfficeAccess(req.user, q.officeId);
    else if (req.user.role === 'office_agent' && !q.clientId) q.officeId = req.user.officeId;
    return q;
  };

  // ── Clients ──
  app.get('/clients', async (_req, reply) => send(reply, await WarehousingService.clients()));
  app.get('/clients/:id/settings', async (req, reply) =>
    send(reply, await WarehousingService.settings(id(req))),
  );
  app.put('/clients/:id/settings', manage, async (req, reply) =>
    send(
      reply,
      await WarehousingService.saveSettings(id(req), parse(WarehousingSettingsSchema, req.body)),
      200,
      'Warehousing settings saved',
    ),
  );
  app.get('/clients/:id/summary', async (req, reply) =>
    send(reply, await WarehousingService.summary(id(req))),
  );

  // ── Products ──
  app.get('/products', async (req, reply) => {
    const q = parse(ProductListQuerySchema, req.query);
    if (!q.clientId) throw badRequest('Choose a client');
    return send(reply, await WarehousingService.listProducts(q.clientId, q));
  });
  app.post('/products', ops, async (req, reply) => {
    const { clientId, ...input } = parse(
      ProductInputSchema.extend({ clientId: ObjectIdSchema }),
      req.body,
    );
    return send(
      reply,
      await WarehousingService.createProduct(clientId, input),
      201,
      'Product added',
    );
  });
  app.patch('/products/:id', ops, async (req, reply) => {
    const product = await ProductModel.findById(id(req), 'client').lean();
    if (!product) throw notFound('Product not found');
    return send(
      reply,
      await WarehousingService.updateProduct(
        product.client.toString(),
        id(req),
        parse(ProductUpdateSchema, req.body),
      ),
      200,
      'Product updated',
    );
  });

  // ── Stock ──
  app.get('/stock', async (req, reply) =>
    send(
      reply,
      await WarehousingService.listStock(scopeOffice(req, parse(StockQuerySchema, req.query))),
    ),
  );
  app.post('/stock/adjust', floor, async (req, reply) => {
    const input = parse(StockAdjustSchema, req.body);
    assertOfficeAccess(req.user, input.officeId);
    await StockService.adjust(input, { type: 'admin', id: req.user.sub });
    return send(reply, null, 200, 'Stock adjusted');
  });
  app.put('/stock/bin', floor, async (req, reply) => {
    const input = parse(SetBinSchema, req.body);
    assertOfficeAccess(req.user, input.officeId);
    await WarehousingService.setBin(input);
    return send(reply, null, 200, 'Bin saved');
  });
  /** Move a client's units to another warehouse; they arrive as an inbound there. */
  app.post('/transfers', floor, async (req, reply) => {
    const input = parse(StockTransferSchema, req.body);
    assertOfficeAccess(req.user, input.fromOfficeId);
    return send(
      reply,
      await TransfersService.create(input, { type: 'admin', id: req.user.sub }),
      201,
      'Stock on its way',
    );
  });
  app.get('/movements', async (req, reply) =>
    send(reply, await WarehousingService.movements(parse(MovementQuerySchema, req.query))),
  );

  // ── Inbound ──
  app.get('/inbounds', async (req, reply) => {
    const page = await WarehousingService.listInbounds(
      scopeOffice(req, parse(InboundListQuerySchema, req.query)),
    );
    return send(reply, { ...page, items: page.items.map(toInboundDto) });
  });
  app.post('/inbounds', ops, async (req, reply) => {
    const { clientId, ...input } = parse(AdminInboundCreateSchema, req.body);
    const { inbound, created } = await WarehousingService.createInbound(clientId, input);
    return send(
      reply,
      toInboundDto(inbound),
      created ? 201 : 200,
      created ? 'Inbound expected' : undefined,
    );
  });
  app.get('/inbounds/:id', async (req, reply) =>
    send(reply, toInboundDto(await WarehousingService.findInbound(id(req)))),
  );
  app.post('/inbounds/:id/receive', floor, async (req, reply) =>
    send(
      reply,
      await WarehousingService.receiveInbound(
        id(req),
        parse(InboundReceiveSchema, req.body),
        actor(req),
      ),
      200,
      'Stock received',
    ),
  );
  app.post('/inbounds/:id/cancel', ops, async (req, reply) =>
    send(
      reply,
      toInboundDto(await WarehousingService.cancelInbound(id(req))),
      200,
      'Inbound cancelled',
    ),
  );

  // ── Orders ──
  app.get('/orders', async (req, reply) => {
    const page = await OrdersService.list(scopeOffice(req, parse(OrderListQuerySchema, req.query)));
    return send(reply, { ...page, items: page.items.map((o) => toOrderDto(o)) });
  });
  app.post('/orders', ops, async (req, reply) => {
    const { clientId, ...input } = parse(AdminOrderCreateSchema, req.body);
    const { order, created } = await OrdersService.create(
      clientId,
      input,
      { type: 'admin', id: req.user.sub },
      'admin',
    );
    return send(
      reply,
      toOrderDto(order),
      created ? 201 : 200,
      created ? 'Order created' : undefined,
    );
  });
  app.get('/orders/:id', async (req, reply) => send(reply, await OrdersService.detail(id(req))));
  app.post('/orders/:id/pick', floor, async (req, reply) =>
    send(reply, await OrdersService.startPicking(id(req), actor(req)), 200, 'Picking started'),
  );
  app.post('/orders/:id/pack', floor, async (req, reply) =>
    send(
      reply,
      await OrdersService.pack(id(req), parse(OrderPackSchema, req.body), actor(req)),
      200,
      'Packed and handed in',
    ),
  );
  app.post('/orders/:id/cancel', ops, async (req, reply) => {
    const { reason } = parse(ReasonBody, req.body ?? {});
    const order = await OrdersService.cancel(id(req), { type: 'admin', id: req.user.sub }, reason);
    return send(reply, toOrderDto(order), 200, 'Order cancelled');
  });
  app.post('/orders/:id/restock', floor, async (req, reply) =>
    send(
      reply,
      await OrdersService.restock(id(req), parse(OrderRestockSchema, req.body), actor(req)),
      200,
      'Return processed',
    ),
  );
}
