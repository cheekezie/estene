import type { FastifyInstance } from 'fastify';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { PaginationQuerySchema } from '@estene/contracts/common';
import { SHIPMENT_STATUSES } from '@estene/contracts/enums';
import { ApiCreateShipmentSchema, QuoteRequestSchema } from '@estene/contracts/shipment';
import { notFound } from '../../lib/errors';
import { paginate, parse, send } from '../../lib/response';
import { ShipmentModel, type IShipment } from '../shipments/models/shipment.model';
import { SHIPMENT_POPULATE } from '../shipments/shipments.mapper';
import { ShipmentsService } from '../shipments/shipments.service';
import { PricingService } from '../pricing/pricing.service';
import { ZonesService } from '../zones/zones.service';
import { authenticateApiKey, perKeyRateLimit } from './integration.auth';
import { toIntegrationShipmentDto } from './integration.mapper';

const ShipmentRef = z.object({ ref: z.string().trim().min(6).max(64) });
const ListQuery = PaginationQuerySchema.extend({
  status: z.enum(SHIPMENT_STATUSES).optional(),
  clientReference: z.string().trim().max(64).optional(),
});

/**
 * Versioned integration API for business clients (docs/integrations.md).
 * Every query is scoped to the calling client — an shipment id from another
 * client is simply "not found".
 */
export async function integrationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticateApiKey);

  /** Accepts our id, our tracking number, or the client's own reference. */
  const findOwnShipment = async (clientId: string, ref: string) => {
    const or: FilterQuery<IShipment>[] = [
      { trackingNumber: ref.toUpperCase() },
      { clientReference: ref },
    ];
    if (/^[a-f\d]{24}$/i.test(ref)) or.push({ _id: ref });
    const shipment = await ShipmentModel.findOne({ client: clientId, $or: or }).populate(
      SHIPMENT_POPULATE,
    );
    if (!shipment) throw notFound('Shipment not found');
    return shipment;
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

  app.post('/shipments', { config: perKeyRateLimit(60) }, async (req, reply) => {
    const { clientReference, ...input } = parse(ApiCreateShipmentSchema, req.body);
    const { shipment, created } = await ShipmentsService.create(
      input,
      { type: 'client', id: req.apiClient.clientId },
      { source: 'api', clientId: req.apiClient.clientId, clientReference },
    );
    // 200 on an idempotent replay so integrators can tell it apart from a fresh create.
    return send(
      reply,
      toIntegrationShipmentDto(shipment),
      created ? 201 : 200,
      created ? 'Shipment created' : 'Shipment already exists for this clientReference',
    );
  });

  app.get('/shipments', { config: perKeyRateLimit(120) }, async (req, reply) => {
    const q = parse(ListQuery, req.query);
    const filter: FilterQuery<IShipment> = { client: req.apiClient.clientId };
    if (q.status) filter.status = q.status;
    if (q.clientReference) filter.clientReference = q.clientReference;
    const [shipments, total] = await Promise.all([
      ShipmentModel.find(filter)
        .populate(SHIPMENT_POPULATE)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      ShipmentModel.countDocuments(filter),
    ]);
    return send(reply, paginate(shipments.map(toIntegrationShipmentDto), total, q.page, q.limit));
  });

  app.get('/shipments/:ref', { config: perKeyRateLimit(300) }, async (req, reply) => {
    const { ref } = parse(ShipmentRef, req.params);
    return send(
      reply,
      toIntegrationShipmentDto(await findOwnShipment(req.apiClient.clientId, ref)),
    );
  });

  /** Allowed until a rider is on the way to pickup (enforced by the shipment state machine). */
  app.post('/shipments/:ref/cancel', { config: perKeyRateLimit(60) }, async (req, reply) => {
    const { ref } = parse(ShipmentRef, req.params);
    const { reason } = parse(
      z.object({ reason: z.string().trim().max(300).optional() }),
      req.body ?? {},
    );
    const shipment = await findOwnShipment(req.apiClient.clientId, ref);
    await ShipmentsService.cancel(
      shipment.id,
      { type: 'client', id: req.apiClient.clientId },
      reason,
    );
    return send(
      reply,
      toIntegrationShipmentDto(await findOwnShipment(req.apiClient.clientId, shipment.id)),
      200,
      'Shipment cancelled',
    );
  });
}
