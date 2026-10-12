import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { FinanceService, LedgerQuerySchema, RiderMoneySchema } from './finance.service';

const RangeQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

export async function financeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  app.addHook('preHandler', requireRole('finance'));

  app.get('/summary', async (req, reply) => {
    const { from, to } = parse(RangeQuery, req.query);
    return send(reply, await FinanceService.summary(from, to));
  });

  app.get('/entries', async (req, reply) =>
    send(reply, await FinanceService.entries(parse(LedgerQuerySchema, req.query))),
  );

  app.get('/rider-balances', async (_req, reply) =>
    send(reply, await FinanceService.riderBalances()),
  );

  app.post('/remittances', async (req, reply) => {
    await FinanceService.recordRemittance(parse(RiderMoneySchema, req.body), req.user.sub);
    return send(reply, null, 201, 'Cash remittance recorded');
  });
}
