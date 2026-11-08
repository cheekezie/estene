import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChangePasswordSchema } from '@estene/contracts/auth';
import { ObjectIdSchema, PaginationQuerySchema } from '@estene/contracts/common';
import { UploadRequestSchema } from '@estene/contracts/upload';
import { ConfirmDeliverySchema, ConfirmPickupSchema } from '@estene/contracts/shipment';
import { RiderHeartbeatSchema, RiderPushTokenSchema } from '@estene/contracts/rider';
import { SHIPMENT_STATUSES } from '@estene/contracts/enums';
import { badRequest, forbidden } from '../../lib/errors';
import { parse, send } from '../../lib/response';
import { requireActor } from '../../plugins/auth';
import { DispatchService } from '../dispatch/dispatch.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { RidersService } from '../riders/riders.service';
import { RiderModel } from '../riders/models/rider.model';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { PaymentsService } from '../payments/payments.service';
import { PresenceService } from '../riders/presence.service';
import { PayoutsService } from '../payouts/payouts.service';
import { UploadsService } from '../uploads/uploads.service';

/** Proof photos must be files we issued an upload for, not any link on the internet. */
function assertOurPhoto(photoUrl: string | undefined) {
  if (photoUrl && !UploadsService.isOurFile(photoUrl))
    throw badRequest('Upload the photo through the app', 'PHOTO_NOT_UPLOADED');
}

const IdParams = z.object({ id: ObjectIdSchema });

/** Endpoints the rider mobile app calls. Every route is scoped to the signed-in rider. */
export async function riderAppRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('rider'));

  app.get('/me', async (req, reply) => send(reply, await RidersService.get(req.user.sub)));

  app.post(
    '/me/password',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) =>
      send(
        reply,
        await RidersService.changePassword(req.user.sub, parse(ChangePasswordSchema, req.body)),
        200,
        'Password changed',
      ),
  );

  // ── Push notifications ──────────────────────────────────────────────────
  app.post('/push-token', async (req, reply) =>
    send(
      reply,
      await RidersService.savePushToken(req.user.sub, parse(RiderPushTokenSchema, req.body)),
    ),
  );
  /** Signing out on this phone: stop sending it offers. */
  app.post('/push-token/clear', async (req, reply) => {
    const { token } = parse(z.object({ token: z.string().min(1).max(200) }), req.body);
    return send(reply, await RidersService.clearPushToken(req.user.sub, token));
  });

  // ── Photos ──────────────────────────────────────────────────────────────
  app.post(
    '/uploads',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (req, reply) =>
      send(reply, await UploadsService.createTicket(parse(UploadRequestSchema, req.body)), 201),
  );

  // ── Money and history ───────────────────────────────────────────────────
  app.get('/earnings', async (req, reply) =>
    send(reply, await PayoutsService.riderEarnings(req.user.sub)),
  );
  app.get('/payouts', async (req, reply) =>
    send(
      reply,
      await PayoutsService.list({
        ...parse(PaginationQuerySchema, req.query),
        riderId: req.user.sub,
      }),
    ),
  );
  app.get('/history', async (req, reply) =>
    send(
      reply,
      await ShipmentsService.riderHistory(req.user.sub, parse(PaginationQuerySchema, req.query)),
    ),
  );

  // ── Presence ────────────────────────────────────────────────────────────
  app.post(
    '/presence/heartbeat',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const point = parse(RiderHeartbeatSchema, req.body);
      // Suspended riders keep their token until it expires — don't let them appear online.
      if (!(await RiderModel.exists({ _id: req.user.sub, status: 'active' })))
        throw forbidden('Your account is not active');
      await PresenceService.heartbeat(req.user.sub, point);
      return send(reply, { online: true });
    },
  );

  app.post('/presence/offline', async (req, reply) => {
    await PresenceService.goOffline(req.user.sub);
    return send(reply, { online: false });
  });

  // ── Job offers ──────────────────────────────────────────────────────────
  app.get('/offers', async (req, reply) =>
    send(reply, await DispatchService.pendingOffersFor(req.user.sub)),
  );

  app.post('/offers/:id/accept', async (req, reply) =>
    send(
      reply,
      await DispatchService.respond(parse(IdParams, req.params).id, req.user.sub, true),
      200,
      'Job accepted',
    ),
  );

  app.post('/offers/:id/decline', async (req, reply) => {
    await DispatchService.respond(parse(IdParams, req.params).id, req.user.sub, false);
    return send(reply, null, 200, 'Offer declined');
  });

  // ── Active jobs ─────────────────────────────────────────────────────────
  app.get('/jobs', async (req, reply) =>
    send(reply, await ShipmentsService.riderJobs(req.user.sub)),
  );

  app.post('/jobs/:id/start-pickup', async (req, reply) =>
    send(reply, await ShipmentsService.startPickup(parse(IdParams, req.params).id, req.user.sub)),
  );

  app.post('/jobs/:id/pickup', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(ConfirmPickupSchema, req.body);
    assertOurPhoto(input.photoUrl);
    return send(
      reply,
      await ShipmentsService.confirmPickup(id, req.user.sub, input),
      200,
      'Parcel picked up',
    );
  });

  app.post('/jobs/:id/advance', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { status, note } = parse(
      z.object({ status: z.enum(SHIPMENT_STATUSES), note: z.string().max(300).optional() }),
      req.body,
    );
    return send(reply, await ShipmentsService.advance(id, req.user.sub, status, note));
  });

  /** Last mile from an office: the rider scans the parcel's QR tag at the counter to take it. */
  app.post('/jobs/:id/collect-from-office', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { tagCode } = parse(z.object({ tagCode: z.string().trim().min(6) }), req.body);
    return send(
      reply,
      await ShipmentsService.collectFromOffice(id, req.user.sub, tagCode),
      200,
      'Out for delivery',
    );
  });

  /** Sender couldn't pay the re-priced balance online — the rider takes it in cash before handing over. */
  app.post('/jobs/:id/collect-balance', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const shipment = await ShipmentModel.findOne({ _id: id, rider: req.user.sub }, '_id');
    if (!shipment) throw forbidden('This job is not assigned to you');
    const payment = await PaymentsService.recordCash(id, req.user.sub);
    return send(
      reply,
      { collected: payment?.amount ?? 0 },
      200,
      payment ? 'Cash recorded' : 'Nothing outstanding',
    );
  });

  app.post('/jobs/:id/deliver', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(ConfirmDeliverySchema, req.body);
    assertOurPhoto(input.photoUrl);
    return send(
      reply,
      await ShipmentsService.confirmDelivery(id, req.user.sub, input),
      200,
      'Delivered',
    );
  });
}
