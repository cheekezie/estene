import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import {
  CreateManifestSchema,
  ManifestListQuerySchema,
  ScanSchema,
  UpdateManifestCarrierSchema,
} from '@estene/contracts/manifest';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { ManifestsService } from './manifests.service';

const IdParams = z.object({ id: ObjectIdSchema });

/** Line-haul between offices. Office agents and ops run these. */
export async function manifestsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  app.addHook('preHandler', requireRole('ops_manager', 'office_agent', 'dispatcher'));
  const actor = (sub: string) => ({ type: 'admin' as const, id: sub });
  const id = (p: unknown) => parse(IdParams, p).id;

  app.get('/', async (req, reply) =>
    send(reply, await ManifestsService.list(parse(ManifestListQuerySchema, req.query))),
  );
  app.get('/:id', async (req, reply) => send(reply, await ManifestsService.get(id(req.params))));
  app.post('/', async (req, reply) =>
    send(
      reply,
      await ManifestsService.create(parse(CreateManifestSchema, req.body), req.user.sub),
      201,
      'Manifest opened',
    ),
  );
  app.patch('/:id', async (req, reply) =>
    send(
      reply,
      await ManifestsService.updateCarrier(
        id(req.params),
        parse(UpdateManifestCarrierSchema, req.body),
      ),
      200,
      'Manifest updated',
    ),
  );

  app.post('/:id/shipments', async (req, reply) =>
    send(
      reply,
      await ManifestsService.addShipment(id(req.params), parse(ScanSchema, req.body).code),
      200,
      'Parcel loaded',
    ),
  );
  app.delete('/:id/shipments/:shipmentId', async (req, reply) => {
    const { shipmentId } = parse(z.object({ shipmentId: ObjectIdSchema }), req.params);
    return send(
      reply,
      await ManifestsService.removeShipment(id(req.params), shipmentId),
      200,
      'Parcel removed',
    );
  });
  app.post('/:id/depart', async (req, reply) =>
    send(
      reply,
      await ManifestsService.depart(id(req.params), actor(req.user.sub)),
      200,
      'Manifest departed',
    ),
  );
  app.post('/:id/receive', async (req, reply) =>
    send(
      reply,
      await ManifestsService.receive(
        id(req.params),
        parse(ScanSchema, req.body).code,
        actor(req.user.sub),
      ),
      200,
      'Parcel checked in',
    ),
  );
  app.post('/:id/receive-all', async (req, reply) =>
    send(
      reply,
      await ManifestsService.receiveAll(id(req.params), actor(req.user.sub)),
      200,
      'All parcels checked in',
    ),
  );
}
