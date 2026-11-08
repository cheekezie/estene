import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  WebhookDeliveryQuerySchema,
  ApiKeyCreateSchema,
  ClientInputSchema,
  ClientListQuerySchema,
  WebhookConfigSchema,
} from '@estene/contracts/client';
import { ObjectIdSchema } from '@estene/contracts/common';
import { CLIENT_STATUSES } from '@estene/contracts/enums';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { PortalUserCreateSchema } from '@estene/contracts/portal';
import { PortalService } from '../portal/portal.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AdminModel } from '../admins/models/admin.model';
import { ClientsService } from './clients.service';

const IdParams = z.object({ id: ObjectIdSchema });

/** Business clients, their API keys and webhook endpoint. */
export async function clientsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  const manage = { preHandler: requireRole('ops_manager') };
  const id = (params: unknown) => parse(IdParams, params).id;

  app.get('/', async (req, reply) =>
    send(reply, await ClientsService.list(parse(ClientListQuerySchema, req.query))),
  );
  app.get('/options', async (_req, reply) => send(reply, await ClientsService.options()));
  /** Staff who can own a client relationship — for the account manager picker. */
  app.get('/account-managers', async (_req, reply) => {
    const staff = await AdminModel.find(
      { isActive: true, role: { $in: ['super_admin', 'ops_manager', 'support', 'finance'] } },
      'name role',
    )
      .sort({ name: 1 })
      .lean();
    return send(
      reply,
      staff.map((a) => ({ id: a._id.toString(), name: a.name, role: a.role })),
    );
  });
  app.get('/:id', async (req, reply) => send(reply, await ClientsService.get(id(req.params))));

  app.post('/', manage, async (req, reply) =>
    send(
      reply,
      await ClientsService.create(parse(ClientInputSchema, req.body), req.user.sub),
      201,
      'Client created',
    ),
  );
  app.patch('/:id', manage, async (req, reply) =>
    send(
      reply,
      await ClientsService.update(id(req.params), parse(ClientInputSchema.partial(), req.body)),
      200,
      'Client updated',
    ),
  );
  app.post('/:id/status', manage, async (req, reply) => {
    const { status } = parse(z.object({ status: z.enum(CLIENT_STATUSES) }), req.body);
    return send(
      reply,
      await ClientsService.setStatus(id(req.params), status),
      200,
      `Client ${status}`,
    );
  });

  // API keys — the plaintext key is in this response only.
  app.post('/:id/api-keys', manage, async (req, reply) => {
    const { name } = parse(ApiKeyCreateSchema, req.body);
    return send(
      reply,
      await ClientsService.createApiKey(id(req.params), name),
      201,
      'API key created — copy it now',
    );
  });
  app.delete('/:id/api-keys/:keyId', manage, async (req, reply) => {
    const { keyId } = parse(z.object({ keyId: ObjectIdSchema }), req.params);
    return send(
      reply,
      await ClientsService.revokeApiKey(id(req.params), keyId),
      200,
      'API key revoked',
    );
  });

  // Webhook endpoint
  app.put('/:id/webhook', manage, async (req, reply) =>
    send(
      reply,
      await ClientsService.configureWebhook(id(req.params), parse(WebhookConfigSchema, req.body)),
      200,
      'Webhook saved',
    ),
  );
  app.delete('/:id/webhook', manage, async (req, reply) =>
    send(reply, await ClientsService.removeWebhook(id(req.params)), 200, 'Webhook removed'),
  );
  app.get('/:id/webhook/secret', manage, async (req, reply) =>
    send(reply, await ClientsService.revealWebhookSecret(id(req.params))),
  );
  app.post('/:id/webhook/rotate-secret', manage, async (req, reply) =>
    send(
      reply,
      await ClientsService.rotateWebhookSecret(id(req.params)),
      200,
      'Secret rotated — update the client’s verifier',
    ),
  );
  app.post('/:id/webhook/test', manage, async (req, reply) =>
    send(reply, await WebhooksService.sendTest(id(req.params)), 202, 'Test event queued'),
  );

  // Developer page: full delivery history, health, and one delivery's payload/response.
  app.get('/:id/webhook/deliveries', async (req, reply) =>
    send(
      reply,
      await WebhooksService.list(id(req.params), parse(WebhookDeliveryQuerySchema, req.query)),
    ),
  );
  app.get('/:id/webhook/stats', async (req, reply) =>
    send(reply, await WebhooksService.stats(id(req.params))),
  );
  app.get('/:id/webhook/deliveries/:deliveryId', async (req, reply) => {
    const { deliveryId } = parse(z.object({ deliveryId: ObjectIdSchema }), req.params);
    return send(reply, await WebhooksService.get(id(req.params), deliveryId));
  });
  app.post('/:id/webhook/deliveries/:deliveryId/resend', manage, async (req, reply) => {
    const { deliveryId } = parse(z.object({ deliveryId: ObjectIdSchema }), req.params);
    return send(
      reply,
      await WebhooksService.resend(id(req.params), deliveryId),
      202,
      'Delivery re-queued',
    );
  });

  // Client portal users. The temporary password is in the create/reset response only.
  const UserParams = z.object({ id: ObjectIdSchema, userId: ObjectIdSchema });
  app.get('/:id/portal-users', async (req, reply) =>
    send(reply, await PortalService.listUsers(id(req.params))),
  );
  app.post('/:id/portal-users', manage, async (req, reply) =>
    send(
      reply,
      await PortalService.createUser(
        id(req.params),
        parse(PortalUserCreateSchema, req.body),
        req.user.sub,
      ),
      201,
      'Portal user created — share the temporary password now',
    ),
  );
  app.post('/:id/portal-users/:userId/reset-password', manage, async (req, reply) => {
    const p = parse(UserParams, req.params);
    return send(
      reply,
      await PortalService.resetPassword(p.id, p.userId),
      200,
      'New temporary password issued',
    );
  });
  app.post('/:id/portal-users/:userId/status', manage, async (req, reply) => {
    const p = parse(UserParams, req.params);
    const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
    return send(
      reply,
      await PortalService.setActive(p.id, p.userId, isActive),
      200,
      isActive ? 'Access restored' : 'Access switched off',
    );
  });
}
