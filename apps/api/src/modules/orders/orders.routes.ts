import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import { AssignRiderSchema, CreateOrderSchema, OrderListQuerySchema, UpdateOrderStatusSchema } from '@estene/contracts/order';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { OrdersService } from './orders.service';

const IdParams = z.object({ id: ObjectIdSchema });
const NoteBody = z.object({ note: z.string().trim().max(300).optional() });

/** Admin/ops order management. */
export async function ordersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  const actor = (sub: string) => ({ type: 'admin' as const, id: sub });
  const dispatcher = { preHandler: requireRole('ops_manager', 'dispatcher') };

  app.get('/', async (req, reply) => send(reply, await OrdersService.list(parse(OrderListQuerySchema, req.query))));

  app.get('/:id', async (req, reply) => send(reply, await OrdersService.get(parse(IdParams, req.params).id)));

  /** Phone bookings taken by support/ops. */
  app.post('/', { preHandler: requireRole('ops_manager', 'dispatcher', 'support') }, async (req, reply) =>
    send(reply, await OrdersService.create(parse(CreateOrderSchema, req.body), actor(req.user.sub)), 201, 'Order booked'),
  );

  app.post('/:id/assign', dispatcher, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { riderId } = parse(AssignRiderSchema, req.body);
    return send(reply, await OrdersService.assignRider(id, riderId, actor(req.user.sub)), 200, 'Rider assigned');
  });

  app.post('/:id/unassign', dispatcher, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { note } = parse(NoteBody, req.body ?? {});
    return send(reply, await OrdersService.unassignRider(id, actor(req.user.sub), note), 200, 'Rider removed');
  });

  app.post('/:id/status', dispatcher, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { status, note } = parse(UpdateOrderStatusSchema, req.body);
    const order = await OrdersService.transition(id, status, actor(req.user.sub), { note });
    return send(reply, await OrdersService.get(order.id), 200, 'Status updated');
  });

  app.post('/:id/cancel', dispatcher, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { note } = parse(NoteBody, req.body ?? {});
    return send(reply, await OrdersService.cancel(id, actor(req.user.sub), note), 200, 'Order cancelled');
  });

  app.post('/:id/mark-paid', { preHandler: requireRole('finance') }, async (req, reply) =>
    send(reply, await OrdersService.markPaid(parse(IdParams, req.params).id), 200, 'Payment recorded'),
  );
}
