import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import { RiderInputSchema, RiderListQuerySchema, RiderStatusUpdateSchema, RiderUpdateSchema } from '@estene/contracts/rider';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { RidersService } from './riders.service';

const IdParams = z.object({ id: ObjectIdSchema });

/** Admin management of the rider network (company and partner riders). */
export async function ridersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  const canManage = { preHandler: requireRole('ops_manager') };

  app.get('/', async (req, reply) => send(reply, await RidersService.list(parse(RiderListQuerySchema, req.query))));

  app.get('/live', async (_req, reply) => send(reply, await RidersService.liveMap()));

  app.get('/:id', async (req, reply) => send(reply, await RidersService.get(parse(IdParams, req.params).id)));

  app.post('/', canManage, async (req, reply) =>
    send(reply, await RidersService.create(parse(RiderInputSchema, req.body), req.user.sub), 201, 'Rider onboarded'),
  );

  app.patch('/:id', canManage, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    return send(reply, await RidersService.update(id, parse(RiderUpdateSchema, req.body)), 200, 'Rider updated');
  });

  app.post('/:id/status', canManage, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { status } = parse(RiderStatusUpdateSchema, req.body);
    return send(reply, await RidersService.setStatus(id, status), 200, `Rider ${status}`);
  });
}
