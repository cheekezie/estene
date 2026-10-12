import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import { ScanSchema } from '@estene/contracts/manifest';
import { ConfirmPickupSchema } from '@estene/contracts/shipment';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { assertOfficeAccess, OfficeOpsService } from './office-ops.service';

const OfficeParams = z.object({ officeId: ObjectIdSchema });
const OfficeShipmentParams = OfficeParams.extend({ shipmentId: ObjectIdSchema });
const HandOverSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN is 4 digits'),
  receivedBy: z.string().trim().max(80).optional(),
  collectCash: z.boolean().optional(),
});

/**
 * The office counter. Every action is available two ways — scan a QR tag /
 * tracking number, or tap the same action in the queue — and both hit these
 * endpoints, so they behave identically.
 */
export async function officeOpsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  app.addHook('preHandler', requireRole('ops_manager', 'office_agent', 'dispatcher', 'support'));

  const ctx = (req: FastifyRequest) => {
    const { officeId } = parse(OfficeParams, req.params);
    assertOfficeAccess(req.user, officeId);
    return { officeId, actor: { type: 'admin' as const, id: req.user.sub } };
  };
  const shipmentId = (req: FastifyRequest) => parse(OfficeShipmentParams, req.params).shipmentId;

  app.get('/:officeId/queue', async (req, reply) =>
    send(reply, await OfficeOpsService.queue(ctx(req).officeId)),
  );

  app.post('/:officeId/scan', async (req, reply) => {
    const { officeId } = ctx(req);
    return send(reply, await OfficeOpsService.scan(officeId, parse(ScanSchema, req.body).code));
  });

  app.post('/:officeId/shipments/:shipmentId/receive-dropoff', async (req, reply) => {
    const { officeId, actor } = ctx(req);
    return send(
      reply,
      await OfficeOpsService.receiveDropoff(
        officeId,
        shipmentId(req),
        parse(ConfirmPickupSchema, req.body),
        actor,
      ),
      200,
      'Parcel checked in',
    );
  });

  /** Rider hand-in and manifest arrival are scan-only: the tag proves the parcel is physically here. */
  app.post('/:officeId/receive-from-rider', async (req, reply) => {
    const { officeId, actor } = ctx(req);
    return send(
      reply,
      await OfficeOpsService.receiveFromRider(officeId, parse(ScanSchema, req.body).code, actor),
      200,
      'Parcel handed in',
    );
  });
  app.post('/:officeId/receive-from-manifest', async (req, reply) => {
    const { officeId, actor } = ctx(req);
    return send(
      reply,
      await OfficeOpsService.receiveFromManifest(officeId, parse(ScanSchema, req.body).code, actor),
      200,
      'Parcel checked in',
    );
  });

  app.post('/:officeId/shipments/:shipmentId/ready-for-collection', async (req, reply) => {
    const { officeId, actor } = ctx(req);
    return send(
      reply,
      await OfficeOpsService.markReadyForCollection(officeId, shipmentId(req), actor),
      200,
      'Recipient notified',
    );
  });
  app.post('/:officeId/shipments/:shipmentId/hand-over', async (req, reply) => {
    const { officeId, actor } = ctx(req);
    return send(
      reply,
      await OfficeOpsService.handToRecipient(
        officeId,
        shipmentId(req),
        parse(HandOverSchema, req.body),
        actor,
      ),
      200,
      'Parcel collected',
    );
  });
  app.post('/:officeId/shipments/:shipmentId/dispatch', async (req, reply) => {
    const { officeId } = ctx(req);
    return send(
      reply,
      await OfficeOpsService.dispatchForDelivery(officeId, shipmentId(req)),
      200,
      'Finding a rider',
    );
  });
}
