import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PaginationQuerySchema } from '@estene/contracts/common';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { TagsService } from './tags.service';

export async function tagsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));

  app.get('/', async (req, reply) => {
    const q = parse(
      PaginationQuerySchema.extend({ status: z.enum(['available', 'bound', 'void']).optional() }),
      req.query,
    );
    return send(reply, await TagsService.list(q.page, q.limit, q.status));
  });

  app.post('/batches', { preHandler: requireRole('ops_manager') }, async (req, reply) => {
    const { count } = parse(z.object({ count: z.number().int().min(1).max(1000) }), req.body);
    return send(reply, await TagsService.generateBatch(count), 201, `${count} tags generated`);
  });
}
