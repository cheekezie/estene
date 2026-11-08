import type { FastifyInstance } from 'fastify';
import { PayoutsService } from '../payouts/payouts.service';
import { PaymentModel } from './models/payment.model';
import { PaymentsService } from './payments.service';
import { gatewayFor } from './providers';

/**
 * Payment gateway webhooks (`POST /api/public/payments/webhooks/:provider`).
 * The signature is checked against the raw body; after that the body is only
 * a hint. Each reference in it is matched to a payment or payout of ours and
 * re-checked with the gateway before anything changes, so a replayed or
 * forged-but-signed body can never mark money as received.
 */
export async function gatewayWebhookRoutes(app: FastifyInstance) {
  // Signatures are over the exact bytes sent, so keep the body as a string in this scope.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
    done(null, body),
  );

  app.post(
    '/payments/webhooks/:provider',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { provider } = req.params as { provider: string };
      const raw = typeof req.body === 'string' ? req.body : '';
      // The URL names the gateway; it must be one we use, and its own check must pass.
      // The current gateway, or a previous one still settling payments or payouts.
      const checker = gatewayFor(provider);
      if (!checker || checker.name !== provider || !checker.verifyWebhook(raw, req.headers)) {
        req.log.warn({ provider }, 'Rejected payment webhook: bad signature or unknown provider');
        return reply
          .status(401)
          .send({ success: false, statusCode: 401, message: 'Invalid signature' });
      }

      const { references } = checker.parseWebhook(raw);
      let matched = 0;
      for (const ref of references) {
        try {
          // A reference is either a customer payment or a rider payout.
          const payment = await PaymentModel.findOne(
            { $or: [{ reference: ref }, { providerReference: ref }] },
            'reference',
          ).lean();
          if (payment) {
            await PaymentsService.verify(payment.reference);
            matched++;
          } else if (await PayoutsService.settleByReference(ref)) {
            matched++;
          }
        } catch (err) {
          // The reconcile sweeps pick it up; the gateway shouldn't keep retrying because of us.
          req.log.error({ err, ref }, 'Payment webhook processing failed');
        }
      }
      if (!matched) req.log.info({ references }, 'Payment webhook matched nothing of ours');
      return reply.status(200).send({ success: true, statusCode: 200, data: { matched } });
    },
  );
}
