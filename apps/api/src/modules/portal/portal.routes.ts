import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema, PaginationQuerySchema } from '@estene/contracts/common';
import { PortalChangePasswordSchema, PortalShipmentQuerySchema } from '@estene/contracts/portal';
import {
  INBOUND_STATUSES,
  InboundCreateSchema,
  ORDER_STATUSES,
  OrderCreateSchema,
  ProductInputSchema,
  ProductUpdateSchema,
} from '@estene/contracts/warehouse';
import { parse, send } from '../../lib/response';
import { requireActor } from '../../plugins/auth';
import { HandlingFeesService } from '../handling-fees/handling-fees.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../warehousing/orders.service';
import { toInboundDto, toOrderDto } from '../warehousing/warehousing.mapper';
import { warehousingClient, WarehousingService } from '../warehousing/warehousing.service';
import { PortalService } from './portal.service';

const Ref = z.object({ ref: z.string().trim().min(1).max(64) });
const IdParam = z.object({ id: ObjectIdSchema });
const ReasonBody = z.object({ reason: z.string().trim().max(300).optional() });

/**
 * Client portal (`/api/portal`). The business comes from the signed-in
 * user's token — never from the request — so every query is scoped to it.
 */
export async function portalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('client'));
  app.addHook('preHandler', async (req) =>
    PortalService.assertActive(req.user.sub, req.user.clientId!),
  );

  const clientOf = (req: FastifyRequest) => req.user.clientId!;
  /** Warehouse endpoints need warehousing switched on for the business. */
  const whClient = async (req: FastifyRequest) => {
    await warehousingClient(clientOf(req));
    return clientOf(req);
  };
  const actor = (req: FastifyRequest) => ({ type: 'client' as const, id: clientOf(req) });

  // ── Account ──
  app.get('/me', async (req, reply) => send(reply, await PortalService.profile(req.user.sub)));
  app.post(
    '/me/password',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) =>
      send(
        reply,
        await PortalService.changePassword(
          req.user.sub,
          parse(PortalChangePasswordSchema, req.body),
        ),
        200,
        'Password changed',
      ),
  );

  app.get('/overview', async (req, reply) =>
    send(reply, await PortalService.overview(clientOf(req))),
  );

  // ── Deliveries and money ──
  app.get('/shipments', async (req, reply) =>
    send(
      reply,
      await PortalService.shipments(clientOf(req), parse(PortalShipmentQuerySchema, req.query)),
    ),
  );
  app.get('/shipments/:ref', async (req, reply) =>
    send(reply, await PortalService.shipment(clientOf(req), parse(Ref, req.params).ref)),
  );
  app.get('/statement', async (req, reply) =>
    send(
      reply,
      await PortalService.statement(clientOf(req), parse(PaginationQuerySchema, req.query)),
    ),
  );

  // ── Warehouse handling fee ──
  // Not behind whClient: a client switched off may still owe for past cycles.
  app.get('/handling-fees', async (req, reply) =>
    send(reply, await HandlingFeesService.view(clientOf(req))),
  );
  app.post('/handling-fees/:id/pay', async (req, reply) =>
    send(reply, await HandlingFeesService.pay(clientOf(req), parse(IdParam, req.params).id)),
  );
  /** After the checkout redirect: confirm with the gateway (scoped to this client's payments). */
  app.post('/payments/:ref/verify', async (req, reply) =>
    send(reply, await PaymentsService.verifyForClient(clientOf(req), parse(Ref, req.params).ref)),
  );

  // ── Products ──
  app.get('/products', async (req, reply) => {
    const q = parse(
      PaginationQuerySchema.extend({ active: z.enum(['true', 'false']).optional() }),
      req.query,
    );
    return send(reply, await WarehousingService.listProducts(await whClient(req), q));
  });
  app.post('/products', async (req, reply) =>
    send(
      reply,
      await WarehousingService.createProduct(
        await whClient(req),
        parse(ProductInputSchema, req.body),
      ),
      201,
      'Product added',
    ),
  );
  app.patch('/products/:ref', async (req, reply) =>
    send(
      reply,
      await WarehousingService.updateProduct(
        await whClient(req),
        parse(Ref, req.params).ref,
        parse(ProductUpdateSchema, req.body),
      ),
      200,
      'Product updated',
    ),
  );

  // ── Stock ──
  app.get('/stock', async (req, reply) => {
    const q = parse(
      PaginationQuerySchema.extend({ lowOnly: z.enum(['true', 'false']).optional() }),
      req.query,
    );
    return send(reply, await WarehousingService.listStock({ ...q, clientId: await whClient(req) }));
  });
  app.get('/movements', async (req, reply) => {
    const q = parse(PaginationQuerySchema, req.query);
    return send(reply, await WarehousingService.movements({ ...q, clientId: await whClient(req) }));
  });

  // ── Inbounds ──
  app.get('/inbounds', async (req, reply) => {
    const q = parse(
      PaginationQuerySchema.extend({ status: z.enum(INBOUND_STATUSES).optional() }),
      req.query,
    );
    const page = await WarehousingService.listInbounds({ ...q, clientId: await whClient(req) });
    return send(reply, { ...page, items: page.items.map(toInboundDto) });
  });
  app.post('/inbounds', async (req, reply) => {
    const { inbound, created } = await WarehousingService.createInbound(
      await whClient(req),
      parse(InboundCreateSchema, req.body),
    );
    return send(
      reply,
      toInboundDto(inbound),
      created ? 201 : 200,
      created ? 'Inbound booked' : undefined,
    );
  });
  app.get('/inbounds/:ref', async (req, reply) =>
    send(
      reply,
      toInboundDto(
        await WarehousingService.findInbound(parse(Ref, req.params).ref, await whClient(req)),
      ),
    ),
  );
  app.post('/inbounds/:ref/cancel', async (req, reply) =>
    send(
      reply,
      toInboundDto(
        await WarehousingService.cancelInbound(parse(Ref, req.params).ref, await whClient(req)),
      ),
      200,
      'Inbound cancelled',
    ),
  );

  // ── Orders ──
  app.get('/orders', async (req, reply) => {
    const q = parse(
      PaginationQuerySchema.extend({ status: z.enum(ORDER_STATUSES).optional() }),
      req.query,
    );
    const page = await OrdersService.list({ ...q, clientId: await whClient(req) });
    return send(reply, { ...page, items: page.items.map((o) => toOrderDto(o)) });
  });
  app.post('/orders', async (req, reply) => {
    const { order, created } = await OrdersService.create(
      await whClient(req),
      parse(OrderCreateSchema, req.body),
      actor(req),
      'portal',
    );
    return send(
      reply,
      toOrderDto(order),
      created ? 201 : 200,
      created ? 'Order placed' : undefined,
    );
  });
  app.get('/orders/:ref', async (req, reply) =>
    send(
      reply,
      toOrderDto(await OrdersService.find(parse(Ref, req.params).ref, await whClient(req))),
    ),
  );
  app.post('/orders/:ref/cancel', async (req, reply) => {
    const { reason } = parse(ReasonBody, req.body ?? {});
    const order = await OrdersService.cancel(
      parse(Ref, req.params).ref,
      actor(req),
      reason,
      await whClient(req),
    );
    return send(reply, toOrderDto(order), 200, 'Order cancelled');
  });
}
