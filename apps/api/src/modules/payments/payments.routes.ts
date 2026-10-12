import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import { TransactionListQuerySchema } from '@estene/contracts/payment';
import { badRequest, notFound } from '../../lib/errors';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { PaymentModel } from './models/payment.model';
import { PaymentsService } from './payments.service';
import { gateway, SimulatorGateway } from './providers';

const IdParams = z.object({ id: ObjectIdSchema });
const ManualPaymentSchema = z.object({
  amount: z.number().int().positive().optional(),
  note: z.string().trim().max(200).optional(),
  reference: z.string().trim().max(100).optional(),
});

/** Money in: every transaction across channels, for finance and support. */
export async function paymentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  const finance = { preHandler: requireRole('finance') };

  app.get('/', async (req, reply) =>
    send(reply, await PaymentsService.list(parse(TransactionListQuerySchema, req.query))),
  );
  app.get('/summary', async (req, reply) =>
    send(reply, await PaymentsService.summary(parse(TransactionListQuerySchema, req.query))),
  );
  app.get('/:id', async (req, reply) =>
    send(reply, await PaymentsService.get(parse(IdParams, req.params).id)),
  );

  /** Ask the gateway again — for a payment the customer says went through. */
  app.post('/:id/requery', async (req, reply) =>
    send(
      reply,
      await PaymentsService.requery(parse(IdParams, req.params).id),
      200,
      'Status refreshed',
    ),
  );

  app.get('/shipment/:id', async (req, reply) =>
    send(reply, await PaymentsService.listForShipment(parse(IdParams, req.params).id)),
  );

  /** Money that reached us outside the gateway (direct bank transfer, client invoice settled). */
  app.post('/shipment/:id/record', finance, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    return send(
      reply,
      await PaymentsService.recordManual(
        id,
        req.user.sub,
        parse(ManualPaymentSchema, req.body ?? {}),
      ),
      201,
      'Payment recorded',
    );
  });

  /** Issue (or re-show) an account number for what's owed — staff read it out to callers. */
  app.post('/shipment/:id/transfer', async (req, reply) =>
    send(reply, await PaymentsService.startTransfer(parse(IdParams, req.params).id), 201),
  );

  /** Simulator only: pretend the customer's bank transfer landed. */
  app.post('/:id/simulate-transfer', finance, async (req, reply) => {
    if (gateway.name !== 'simulator') throw badRequest('Only available with the payment simulator');
    const payment = await PaymentModel.findById(parse(IdParams, req.params).id);
    if (!payment || payment.channel !== 'virtual_account')
      throw notFound('Transfer payment not found');
    await SimulatorGateway.setOutcome(payment.reference, 'success', payment.amount);
    await PaymentsService.verify(payment.reference);
    return send(reply, await PaymentsService.get(payment.id), 200, 'Simulated transfer received');
  });
}
