import { Redis } from 'ioredis';
import { env } from '../config/env';

/** Shared connection for app commands (presence, caching, rate limiting). */
// `family: 0` resolves both IPv4 and IPv6 — Railway's private network is IPv6-only.
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, family: 0 });

/** BullMQ needs its own connections with `maxRetriesPerRequest: null`. */
export const createQueueConnection = () =>
  new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, family: 0 });

redis.on('error', (err) => console.error('[redis]', err.message));
