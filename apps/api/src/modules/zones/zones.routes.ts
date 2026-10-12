import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ZoneInputSchema } from '@estene/contracts/zone';
import { ObjectIdSchema } from '@estene/contracts/common';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { ZonesService } from './zones.service';

const IdParams = z.object({ id: ObjectIdSchema });

export async function zonesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  const canEdit = { preHandler: requireRole('ops_manager') };

  app.get('/', async (_req, reply) => send(reply, await ZonesService.list()));

  app.post('/', canEdit, async (req, reply) =>
    send(reply, await ZonesService.create(parse(ZoneInputSchema, req.body)), 201, 'Zone created'),
  );

  app.patch('/:id', canEdit, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    return send(reply, await ZonesService.update(id, parse(ZoneInputSchema.partial(), req.body)), 200, 'Zone updated');
  });
}
