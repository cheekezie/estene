import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from '../config/env';
import { redis } from '../lib/redis';

export const securityPlugin = fp(async (app: FastifyInstance) => {
  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  // Redis-backed so limits hold across every API instance behind the load balancer.
  // Sensitive routes (login, public booking, tracking) set a tighter per-route `config.rateLimit`.
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute', redis });
});
