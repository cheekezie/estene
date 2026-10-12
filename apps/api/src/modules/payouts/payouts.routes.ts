import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NIGERIAN_BANKS } from '@estene/contracts/banks';
import { ObjectIdSchema } from '@estene/contracts/common';
import {
  BankAccountInputSchema,
  BulkPayoutSchema,
  CreatePayoutSchema,
  PayoutListQuerySchema,
} from '@estene/contracts/payout';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { PayoutsService } from './payouts.service';

const IdParams = z.object({ id: ObjectIdSchema });

/** Rider earnings and money out. Finance only. */
export async function payoutsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  app.addHook('preHandler', requireRole('finance'));

  app.get('/banks', async (_req, reply) => send(reply, NIGERIAN_BANKS));
  app.get('/earnings', async (_req, reply) => send(reply, await PayoutsService.earnings()));
  app.get('/earnings/:id', async (req, reply) =>
    send(reply, await PayoutsService.riderEarnings(parse(IdParams, req.params).id)),
  );

  app.put('/riders/:id/bank-account', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    return send(
      reply,
      await PayoutsService.setBankAccount(id, parse(BankAccountInputSchema, req.body)),
      200,
      'Bank account verified and saved',
    );
  });

  app.get('/', async (req, reply) =>
    send(reply, await PayoutsService.list(parse(PayoutListQuerySchema, req.query))),
  );
  app.get('/:id', async (req, reply) =>
    send(reply, await PayoutsService.get(parse(IdParams, req.params).id)),
  );
  app.post('/', async (req, reply) =>
    send(
      reply,
      await PayoutsService.create(parse(CreatePayoutSchema, req.body), req.user.sub),
      201,
      'Payout created',
    ),
  );
  app.post('/bulk', async (req, reply) => {
    const { riderIds } = parse(BulkPayoutSchema, req.body);
    return send(reply, await PayoutsService.bulk(riderIds, req.user.sub), 201, 'Payouts queued');
  });
  app.post('/:id/retry', async (req, reply) =>
    send(
      reply,
      await PayoutsService.retry(parse(IdParams, req.params).id),
      200,
      'Payout re-queued',
    ),
  );
}
