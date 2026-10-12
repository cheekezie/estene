import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AdminLoginSchema, RiderLoginSchema } from '@estene/contracts/auth';
import { isProd } from '../../config/env';
import { env } from '../../config/env';
import { parse, send } from '../../lib/response';
import { unauthorized } from '../../lib/errors';
import { requireActor } from '../../plugins/auth';
import { createAuthService } from './auth.service';

const REFRESH_COOKIE = 'estene_rt';
const loginLimit = { rateLimit: { max: 10, timeWindow: '15 minutes' } };

/**
 * Browsers (admin, web) get the refresh token in an httpOnly cookie scoped to
 * /api/auth; the rider mobile app has no cookie jar, so it receives the token
 * in the body and sends it back in the body.
 */
export async function authRoutes(app: FastifyInstance) {
  const auth = createAuthService(app);
  const meta = (req: FastifyRequest) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

  const setRefreshCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400,
    });

  app.post('/admin/login', { config: loginLimit }, async (req, reply) => {
    const { refreshToken, accessToken, user } = await auth.adminLogin(parse(AdminLoginSchema, req.body), meta(req));
    setRefreshCookie(reply, refreshToken);
    return send(reply, { accessToken, user });
  });

  app.post('/rider/login', { config: loginLimit }, async (req, reply) => {
    const session = await auth.riderLogin(parse(RiderLoginSchema, req.body), meta(req));
    return send(reply, session);
  });

  app.post('/refresh', async (req, reply) => {
    const bodyToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    const token = req.cookies[REFRESH_COOKIE] ?? bodyToken;
    if (!token) throw unauthorized('Session expired');

    const tokens = await auth.refresh(token, meta(req));
    if (bodyToken) return send(reply, tokens);
    setRefreshCookie(reply, tokens.refreshToken);
    return send(reply, { accessToken: tokens.accessToken });
  });

  app.post('/logout', async (req, reply) => {
    const bodyToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    await auth.logout(req.cookies[REFRESH_COOKIE] ?? bodyToken);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return send(reply, null, 200, 'Signed out');
  });

  app.get('/admin/me', { preHandler: [app.authenticate, requireActor('admin')] }, async (req, reply) =>
    send(reply, await auth.adminProfile(req.user.sub)),
  );
}
