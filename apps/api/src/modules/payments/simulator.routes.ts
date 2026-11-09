import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { formatNaira } from '@estene/contracts/money';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/response';
import { PaymentModel } from './models/payment.model';
import { PaymentsService } from './payments.service';
import { SimulatorGateway } from './providers';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Only ever redirect back to our own site, never an arbitrary URL from the query string. */
const safeReturn = (raw: string | undefined, fallback: string) => {
  try {
    const url = new URL(raw ?? '');
    // The website's /pay/return (bookings) or the portal's /billing (handling fees).
    return ['http:', 'https:'].includes(url.protocol) &&
      (url.pathname.startsWith('/pay/return') || url.pathname.startsWith('/billing'))
      ? url.toString()
      : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Development-only checkout page that stands in for the gateway's hosted
 * checkout. Registered only when PAYMENTS_PROVIDER=simulator.
 */
export async function simulatorRoutes(app: FastifyInstance) {
  app.get('/payments/:reference/simulate', async (req, reply) => {
    const { reference } = parse(z.object({ reference: z.string() }), req.params);
    const { return: ret } = req.query as { return?: string };
    const payment = await PaymentModel.findOne({ reference }).populate<{
      shipment: { trackingNumber: string } | null;
    }>('shipment', 'trackingNumber');
    if (!payment) throw notFound('Payment not found');
    const what = payment.shipment
      ? `Shipment ${payment.shipment.trackingNumber}`
      : 'Warehouse handling fee';

    reply.header(
      'content-security-policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    );
    return reply.type('text/html')
      .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test checkout</title>
<style>body{font-family:system-ui,sans-serif;background:#f1f4f9;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#fff;border-radius:16px;padding:32px;max-width:380px;width:calc(100% - 32px);box-shadow:0 10px 30px #0f172a1a}
.tag{display:inline-block;background:#fff4e0;color:#b45309;font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px}h1{font-size:32px;margin:16px 0 4px}p{color:#5b6477;margin:0 0 24px}
button{width:100%;padding:14px;border:0;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-top:10px}.ok{background:#3230aa;color:#fff}.no{background:#f1f4f9;color:#0f172a}</style></head>
<body><main><span class="tag">Test mode · no real money</span><h1>${esc(formatNaira(payment.amount))}</h1><p>${esc(what)} · ref ${esc(reference)}</p>
<form method="post"><input type="hidden" name="return" value="${esc(ret ?? '')}"><button class="ok" name="outcome" value="success">Pay ${esc(formatNaira(payment.amount))}</button><button class="no" name="outcome" value="failed">Decline payment</button></form></main></body></html>`);
  });

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    },
  );

  app.post('/payments/:reference/simulate', async (req, reply) => {
    const { reference } = parse(z.object({ reference: z.string() }), req.params);
    const { outcome, return: ret } = parse(
      z.object({ outcome: z.enum(['success', 'failed']), return: z.string().optional() }),
      req.body,
    );
    const payment = await PaymentModel.findOne({ reference });
    if (!payment) throw notFound('Payment not found');
    await SimulatorGateway.setOutcome(reference, outcome, payment.amount);
    await PaymentsService.verify(reference);
    return reply.redirect(safeReturn(ret, `${req.protocol}://${req.hostname}/`));
  });
}
