import type { FastifyRequest } from 'fastify';
import { unauthorized } from '../../lib/errors';
import { ClientsService, type ApiKeyPrincipal } from '../clients/clients.service';

declare module 'fastify' {
  interface FastifyRequest {
    apiClient: ApiKeyPrincipal;
  }
}

/** `Authorization: Bearer est_live_…` → request.apiClient. */
export async function authenticateApiKey(req: FastifyRequest) {
  const header = req.headers.authorization ?? '';
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const principal = key ? await ClientsService.authenticateKey(key) : null;
  if (!principal) throw unauthorized('Missing or invalid API key');
  req.apiClient = principal;
}

/** Rate limits are per API key, not per IP — many clients sit behind shared egress IPs. */
export const perKeyRateLimit = (max: number) => ({
  rateLimit: {
    max,
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => req.headers.authorization?.slice(-16) ?? req.ip,
  },
});
