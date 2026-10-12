import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import { OfficeInputSchema } from '@estene/contracts/office';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { OfficesService } from './offices.service';

export async function officesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  const manage = { preHandler: requireRole('ops_manager') };

  app.get('/', async (_req, reply) => send(reply, await OfficesService.list()));
  app.post('/', manage, async (req, reply) =>
    send(
      reply,
      await OfficesService.create(parse(OfficeInputSchema, req.body)),
      201,
      'Office created',
    ),
  );
  app.patch('/:id', manage, async (req, reply) => {
    const { id } = parse(z.object({ id: ObjectIdSchema }), req.params);
    return send(
      reply,
      await OfficesService.update(id, parse(OfficeInputSchema.partial(), req.body)),
      200,
      'Office updated',
    );
  });
}
