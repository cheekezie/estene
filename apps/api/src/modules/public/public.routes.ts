import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateShipmentSchema, QuoteRequestSchema } from '@estene/contracts/shipment';
import { notFound } from '../../lib/errors';
import { parse, send } from '../../lib/response';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../pricing/pricing.service';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { ShipmentsService } from '../shipments/shipments.service';
import { ZonesService } from '../zones/zones.service';
import { OfficesService } from '../offices/offices.service';

const TrackingParams = z.object({ trackingNumber: z.string().trim().min(6).max(20) });
const RefParams = z.object({ reference: z.string().trim().min(6).max(40) });

/**
 * Unauthenticated endpoints for the public website. Each is rate limited
 * per IP; responses expose only what a customer needs.
 */
export async function publicRoutes(app: FastifyInstance) {
  app.get('/zones', async (_req, reply) => {
    const zones = await ZonesService.list({ activeOnly: true });
    return send(
      reply,
      zones.map(({ id, name, code, areas, city, state }) => ({
        id,
        name,
        code,
        areas,
        city,
        state,
      })),
    );
  });

  /** Offices for drop-off and collection. */
  app.get('/offices', async (_req, reply) => send(reply, await OfficesService.listPublic()));

  app.post(
    '/quote',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { lines, total } = await PricingService.quote(parse(QuoteRequestSchema, req.body));
      return send(reply, { lines, total });
    },
  );

  /** Books a shipment. Prepaid methods return what the browser needs to pay right away. */
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
      const payment =
        shipment.paymentMethod === 'online' || shipment.paymentMethod === 'transfer'
          ? await PaymentsService.startPayment(
              shipment.id,
              shipment.paymentMethod === 'transfer' ? 'transfer' : 'checkout',
              'booking',
            )
          : null;
      return send(
        reply,
        {
          id: shipment.id,
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
          estimate: { lines, subtotal, total },
          payment,
        },
        201,
        'Booking saved',
      );
    },
  );

  app.get(
    '/track/:trackingNumber',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { trackingNumber } = parse(TrackingParams, req.params);
      const tracking = await ShipmentsService.track(trackingNumber);
      const doc = await ShipmentModel.findOne({ trackingNumber: tracking.trackingNumber });
      return send(reply, {
        ...tracking,
        payment: doc ? await PaymentsService.publicDue(doc) : undefined,
      });
    },
  );

  /** Pay what's owed from the tracking page — online checkout or an account number. */
  app.post(
    '/track/:trackingNumber/pay',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { trackingNumber } = parse(TrackingParams, req.params);
      const { channel } = parse(
        z.object({ channel: z.enum(['checkout', 'transfer']).default('checkout') }),
        req.body ?? {},
      );
      const doc = await ShipmentModel.findOne(
        { trackingNumber: trackingNumber.toUpperCase() },
        '_id',
      );
      if (!doc) throw notFound('We could not find a parcel with that tracking number');
      return send(
        reply,
        await PaymentsService.startPayment(
          doc.id,
          channel === 'transfer' ? 'transfer' : 'checkout',
        ),
      );
    },
  );

  /** Called by the site when the shopper returns from checkout. Re-checks with the gateway. */
  app.post(
    '/payments/:reference/verify',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { reference } = parse(RefParams, req.params);
      const payment = await PaymentsService.verify(reference);
      const shipment = await ShipmentModel.findById(payment?.shipment, 'trackingNumber status');
      return send(reply, {
        reference,
        status: payment?.status ?? 'pending',
        amount: payment?.amount,
        trackingNumber: shipment?.trackingNumber,
        shipmentStatus: shipment?.status,
      });
    },
  );
}
