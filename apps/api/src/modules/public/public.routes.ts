import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateShipmentSchema, QuoteRequestSchema } from '@estene/contracts/shipment';
import { parse, send } from '../../lib/response';
import { ShipmentsService } from '../shipments/shipments.service';
import { PricingService } from '../pricing/pricing.service';
import { ZonesService } from '../zones/zones.service';

/**
 * Unauthenticated endpoints for the public website. Each is rate limited
 * per IP; responses expose only what a customer needs.
 */
export async function publicRoutes(app: FastifyInstance) {
  app.get('/zones', async (_req, reply) => {
    const zones = await ZonesService.list({ activeOnly: true });
    return send(
      reply,
      zones.map(({ id, name, code, areas }) => ({ id, name, code, areas })),
    );
  });

  app.post(
    '/quote',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { lines, total } = await PricingService.quote(parse(QuoteRequestSchema, req.body));
      return send(reply, { lines, total });
    },
  );

  app.post(
    '/shipments',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { shipment } = await ShipmentsService.create(
        parse(CreateShipmentSchema, req.body),
        { type: 'customer' },
        { source: 'web' },
      );
      const { lines, subtotal, total } = shipment.estimate;
      return send(
        reply,
        {
          id: shipment.id,
          trackingNumber: shipment.trackingNumber,
          estimate: { lines, subtotal, total },
        },
        201,
        'Booking confirmed',
      );
    },
  );

  app.get(
    '/track/:trackingNumber',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { trackingNumber } = parse(
        z.object({ trackingNumber: z.string().trim().min(6).max(20) }),
        req.params,
      );
      return send(reply, await ShipmentsService.track(trackingNumber));
    },
  );
}
