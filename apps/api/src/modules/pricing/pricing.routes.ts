import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RouteRateSchema } from '@estene/contracts/pricing';
import { ObjectIdSchema } from '@estene/contracts/common';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { PlatformSettingsSchema, PricingService } from './pricing.service';

export async function pricingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  const canEdit = { preHandler: requireRole('ops_manager', 'finance') };

  app.get('/config', async (_req, reply) => send(reply, await PricingService.getConfig()));

  app.put('/config', canEdit, async (req, reply) =>
    send(reply, await PricingService.updateConfig(parse(PlatformSettingsSchema, req.body), req.user.sub), 200, 'Pricing updated'),
  );

  app.get('/routes', async (_req, reply) => send(reply, await PricingService.listRouteRates()));

  app.put('/routes', canEdit, async (req, reply) => {
    await PricingService.upsertRouteRate(parse(RouteRateSchema, req.body));
    return send(reply, null, 200, 'Route fare saved');
  });

  app.delete('/routes/:id', canEdit, async (req, reply) => {
    const { id } = parse(z.object({ id: ObjectIdSchema }), req.params);
    await PricingService.deleteRouteRate(id);
    return send(reply, null, 200, 'Route fare removed');
  });
}
