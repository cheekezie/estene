import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import { ConfirmDeliverySchema, ConfirmPickupSchema } from '@estene/contracts/order';
import { RiderHeartbeatSchema } from '@estene/contracts/rider';
import { ORDER_STATUSES } from '@estene/contracts/enums';
import { forbidden } from '../../lib/errors';
import { parse, send } from '../../lib/response';
import { requireActor } from '../../plugins/auth';
import { DispatchService } from '../dispatch/dispatch.service';
import { OrdersService } from '../orders/orders.service';
import { RidersService } from '../riders/riders.service';
import { RiderModel } from '../riders/models/rider.model';
import { PresenceService } from '../riders/presence.service';

const IdParams = z.object({ id: ObjectIdSchema });

/** Endpoints the rider mobile app calls. Every route is scoped to the signed-in rider. */
export async function riderAppRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('rider'));

  app.get('/me', async (req, reply) => send(reply, await RidersService.get(req.user.sub)));

  // ── Presence ────────────────────────────────────────────────────────────
  app.post('/presence/heartbeat', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const point = parse(RiderHeartbeatSchema, req.body);
    // Suspended riders keep their token until it expires — don't let them appear online.
    if (!(await RiderModel.exists({ _id: req.user.sub, status: 'active' }))) throw forbidden('Your account is not active');
    await PresenceService.heartbeat(req.user.sub, point);
    return send(reply, { online: true });
  });

  app.post('/presence/offline', async (req, reply) => {
    await PresenceService.goOffline(req.user.sub);
    return send(reply, { online: false });
  });

  // ── Job offers ──────────────────────────────────────────────────────────
  app.get('/offers', async (req, reply) => send(reply, await DispatchService.pendingOffersFor(req.user.sub)));

  app.post('/offers/:id/accept', async (req, reply) =>
    send(reply, await DispatchService.respond(parse(IdParams, req.params).id, req.user.sub, true), 200, 'Job accepted'),
  );

  app.post('/offers/:id/decline', async (req, reply) => {
    await DispatchService.respond(parse(IdParams, req.params).id, req.user.sub, false);
    return send(reply, null, 200, 'Offer declined');
  });

  // ── Active jobs ─────────────────────────────────────────────────────────
  app.get('/jobs', async (req, reply) => send(reply, await OrdersService.riderJobs(req.user.sub)));

  app.post('/jobs/:id/start-pickup', async (req, reply) =>
    send(reply, await OrdersService.startPickup(parse(IdParams, req.params).id, req.user.sub)),
  );

  app.post('/jobs/:id/pickup', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    return send(reply, await OrdersService.confirmPickup(id, req.user.sub, parse(ConfirmPickupSchema, req.body)), 200, 'Parcel picked up');
  });

  app.post('/jobs/:id/advance', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { status, note } = parse(z.object({ status: z.enum(ORDER_STATUSES), note: z.string().max(300).optional() }), req.body);
    return send(reply, await OrdersService.advance(id, req.user.sub, status, note));
  });

  app.post('/jobs/:id/deliver', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    return send(reply, await OrdersService.confirmDelivery(id, req.user.sub, parse(ConfirmDeliverySchema, req.body)), 200, 'Delivered');
  });
}
