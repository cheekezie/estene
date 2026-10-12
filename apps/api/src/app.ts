import Fastify from 'fastify';
import mongoose from 'mongoose';
import { env, isProd } from './config/env';
import { AppError } from './lib/errors';
import { redis } from './lib/redis';
import { authPlugin } from './plugins/auth';
import { securityPlugin } from './plugins/security';
import { adminsRoutes } from './modules/admins/admins.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { clientsRoutes } from './modules/clients/clients.routes';
import { integrationRoutes } from './modules/integration/integration.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { financeRoutes } from './modules/finance/finance.routes';
import { ordersRoutes } from './modules/orders/orders.routes';
import { pricingRoutes } from './modules/pricing/pricing.routes';
import { publicRoutes } from './modules/public/public.routes';
import { riderAppRoutes } from './modules/rider-app/rider-app.routes';
import { ridersRoutes } from './modules/riders/riders.routes';
import { tagsRoutes } from './modules/tags/tags.routes';
import { zonesRoutes } from './modules/zones/zones.routes';

export async function buildApp() {
  const app = Fastify({
    trustProxy: true, // real client IP behind the load balancer (rate limits, session audit)
    bodyLimit: 1024 * 1024,
    logger: isProd
      ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] }
      : {
          level: 'info',
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, ignore: 'pid,hostname' },
          },
        },
  });

  await app.register(securityPlugin);
  await app.register(authPlugin);

  // Must be set before routes register: child plugins capture the handler at registration time.
  app.setNotFoundHandler((_req, reply) =>
    reply
      .status(404)
      .send({ success: false, statusCode: 404, code: 'NOT_FOUND', message: 'Route not found' }),
  );

  app.setErrorHandler(
    (error: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({
          success: false,
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          ...(error.errors && { errors: error.errors }),
        });
      }
      if (error.statusCode === 429) {
        return reply
          .status(429)
          .send({
            success: false,
            statusCode: 429,
            code: 'RATE_LIMITED',
            message: 'Too many requests — slow down and try again shortly',
          });
      }
      if (error.name === 'CastError') {
        return reply
          .status(400)
          .send({
            success: false,
            statusCode: 400,
            code: 'INVALID_ID',
            message: 'Invalid identifier',
          });
      }
      if (error.statusCode && error.statusCode < 500) {
        return reply
          .status(error.statusCode)
          .send({ success: false, statusCode: error.statusCode, message: error.message });
      }
      req.log.error(error);
      return reply
        .status(500)
        .send({
          success: false,
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong',
        });
    },
  );

  app.get('/health', async () => ({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'ok' : 'down',
    redis: redis.status === 'ready' ? 'ok' : 'down',
    env: env.NODE_ENV,
  }));

  // Who calls what:
  //   /api/public/*  — public website (no auth, rate limited)
  //   /api/rider/*   — rider mobile app
  //   /api/v1/*      — business integrations (API key)
  //   everything else — admin back office
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(publicRoutes, { prefix: '/api/public' });
  await app.register(riderAppRoutes, { prefix: '/api/rider' });
  await app.register(integrationRoutes, { prefix: '/api/v1' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(ordersRoutes, { prefix: '/api/orders' });
  await app.register(ridersRoutes, { prefix: '/api/riders' });
  await app.register(zonesRoutes, { prefix: '/api/zones' });
  await app.register(pricingRoutes, { prefix: '/api/pricing' });
  await app.register(tagsRoutes, { prefix: '/api/tags' });
  await app.register(financeRoutes, { prefix: '/api/finance' });
  await app.register(adminsRoutes, { prefix: '/api/staff' });
  await app.register(clientsRoutes, { prefix: '/api/clients' });

  return app;
}
