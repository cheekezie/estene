import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NigerianPhoneSchema, ObjectIdSchema } from '@estene/contracts/common';
import {
  AdminCreateShipmentSchema,
  AssignRiderSchema,
  ShipmentListQuerySchema,
  QuoteRequestSchema,
  UpdateShipmentStatusSchema,
} from '@estene/contracts/shipment';
import { bus } from '../../lib/events';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../pricing/pricing.service';
import { toShipmentDto } from './shipments.mapper';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { ShipmentsService } from './shipments.service';

const IdParams = z.object({ id: ObjectIdSchema });
const NoteBody = z.object({ note: z.string().trim().max(300).optional() });

/** Admin/ops shipment management. */
export async function shipmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  const actor = (sub: string) => ({ type: 'admin' as const, id: sub });
  const dispatcher = { preHandler: requireRole('ops_manager', 'dispatcher') };

  app.get('/', async (req, reply) =>
    send(reply, await ShipmentsService.list(parse(ShipmentListQuerySchema, req.query))),
  );

  app.get('/:id', async (req, reply) =>
    send(reply, await ShipmentsService.get(parse(IdParams, req.params).id)),
  );

  const booker = { preHandler: requireRole('ops_manager', 'dispatcher', 'support') };

  /** Phone bookings keyed in by staff, optionally on behalf of a business client. */
  app.post('/', booker, async (req, reply) => {
    const { clientId, ...input } = parse(AdminCreateShipmentSchema, req.body);
    const { shipment } = await ShipmentsService.create(input, actor(req.user.sub), {
      source: 'admin',
      clientId,
    });
    // Prepaid phone bookings: an account number staff can read out, or a pay link by SMS.
    const payment =
      shipment.paymentMethod === 'transfer' || shipment.paymentMethod === 'online'
        ? await PaymentsService.startPayment(
            shipment.id,
            shipment.paymentMethod === 'transfer' ? 'transfer' : 'checkout',
            'booking',
          )
        : null;
    if (payment) bus.emit('payment.link_requested', { shipmentId: shipment.id });
    return send(reply, { ...toShipmentDto(shipment), payment }, 201, 'Shipment booked');
  });

  app.post('/quote', async (req, reply) => {
    const { lines, total } = await PricingService.quote(parse(QuoteRequestSchema, req.body));
    return send(reply, { lines, total });
  });

  app.get('/lookup-sender', booker, async (req, reply) => {
    const { phone } = parse(z.object({ phone: NigerianPhoneSchema }), req.query);
    return send(reply, await ShipmentsService.lookupSender(phone));
  });

  app.post('/:id/assign', dispatcher, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { riderId } = parse(AssignRiderSchema, req.body);
    return send(
      reply,
      await ShipmentsService.assignRider(id, riderId, actor(req.user.sub)),
      200,
      'Rider assigned',
    );
  });

  app.post('/:id/unassign', dispatcher, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { note } = parse(NoteBody, req.body ?? {});
    return send(
      reply,
      await ShipmentsService.unassignRider(id, actor(req.user.sub), note),
      200,
      'Rider removed',
    );
  });

  app.post('/:id/status', dispatcher, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { status, note } = parse(UpdateShipmentStatusSchema, req.body);
    const shipment = await ShipmentsService.transition(id, status, actor(req.user.sub), { note });
    return send(reply, await ShipmentsService.get(shipment.id), 200, 'Status updated');
  });

  app.post('/:id/cancel', dispatcher, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { note } = parse(NoteBody, req.body ?? {});
    return send(
      reply,
      await ShipmentsService.cancel(id, actor(req.user.sub), note),
      200,
      'Shipment cancelled',
    );
  });
}
