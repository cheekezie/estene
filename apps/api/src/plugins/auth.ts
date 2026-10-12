import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import type { ActorType, AdminRole } from '@estene/contracts/enums';
import type { TokenClaims } from '@estene/contracts/auth';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenClaims;
    user: TokenClaims;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(cookie);
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: env.ACCESS_TOKEN_TTL } });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized('Session expired or invalid');
    }
  });
});

/**
 * Route guards. Compose after `app.authenticate`:
 *   preHandler: [app.authenticate, requireActor('admin'), requireRole('finance')]
 * Claims come from the verified JWT — no DB round-trip.
 */
export const requireActor =
  (...actors: ActorType[]) =>
  async (req: FastifyRequest) => {
    if (!actors.includes(req.user.actor)) throw forbidden();
  };

/** super_admin always passes. */
export const requireRole =
  (...roles: AdminRole[]) =>
  async (req: FastifyRequest) => {
    const role = req.user.role;
    if (!role || (role !== 'super_admin' && !roles.includes(role))) {
      throw forbidden('Your role cannot perform this action');
    }
  };
