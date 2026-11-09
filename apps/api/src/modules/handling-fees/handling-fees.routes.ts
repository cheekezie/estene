import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import {
  FreePeriodInputSchema,
  HandlingFeeRecordPaymentSchema,
  HandlingFeeWaiveSchema,
} from '@estene/contracts/handling-fee';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { HandlingFeesService } from './handling-fees.service';

const ClientParam = z.object({ clientId: ObjectIdSchema });
const FeeParam = z.object({ feeId: ObjectIdSchema });
const PeriodParam = ClientParam.extend({ periodId: ObjectIdSchema });

/** Staff side of warehousing handling fees (`/api/handling-fees`). */
export async function handlingFeesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));

  const manage = { preHandler: requireRole('ops_manager', 'finance') };

  app.get('/clients/:clientId', async (req, reply) =>
    send(reply, await HandlingFeesService.adminView(parse(ClientParam, req.params).clientId)),
  );

  app.post('/clients/:clientId/free-periods', manage, async (req, reply) =>
    send(
      reply,
      await HandlingFeesService.addFreePeriod(
        parse(ClientParam, req.params).clientId,
        parse(FreePeriodInputSchema, req.body),
        req.user.sub,
      ),
      201,
      'Free time added',
    ),
  );

  app.delete('/clients/:clientId/free-periods/:periodId', manage, async (req, reply) => {
    const { clientId, periodId } = parse(PeriodParam, req.params);
    return send(
      reply,
      await HandlingFeesService.removeFreePeriod(clientId, periodId),
      200,
      'Free time removed',
    );
  });

  app.post('/:feeId/waive', manage, async (req, reply) =>
    send(
      reply,
      await HandlingFeesService.waive(
        parse(FeeParam, req.params).feeId,
        req.user.sub,
        parse(HandlingFeeWaiveSchema, req.body).reason,
      ),
      200,
      'Fee waived',
    ),
  );

  app.post('/:feeId/record-payment', { preHandler: requireRole('finance') }, async (req, reply) =>
    send(
      reply,
      await HandlingFeesService.recordPayment(
        parse(FeeParam, req.params).feeId,
        req.user.sub,
        parse(HandlingFeeRecordPaymentSchema, req.body),
      ),
      200,
      'Payment recorded',
    ),
  );

  /** Bill every closed cycle now instead of waiting for the nightly run. */
  app.post('/run', { preHandler: requireRole('finance') }, async (_req, reply) =>
    send(reply, await HandlingFeesService.billAll(), 200, 'Billing run complete'),
  );
}
