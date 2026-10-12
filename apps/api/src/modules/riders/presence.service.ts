import type { GeoPoint } from '@estene/contracts/common';
import { redis } from '../../lib/redis';

/**
 * Live rider presence, kept entirely in Redis — location pings arrive every
 * few seconds per rider and never touch Mongo.
 *
 *   riders:geo              GEO set of every rider's last known position
 *   rider:presence:<id>     exists while the rider is online; expires if pings stop
 */
const GEO_KEY = 'riders:geo';
const presenceKey = (id: string) => `rider:presence:${id}`;
/** A rider who misses pings for this long is treated as offline. */
const PRESENCE_TTL_S = 90;

export type NearbyRider = { riderId: string; distanceKm: number };

export const PresenceService = {
  async heartbeat(riderId: string, point: GeoPoint) {
    await redis
      .multi()
      .geoadd(GEO_KEY, point.lng, point.lat, riderId)
      .set(presenceKey(riderId), JSON.stringify({ ...point, at: Date.now() }), 'EX', PRESENCE_TTL_S)
      .exec();
  },

  async goOffline(riderId: string) {
    await redis.multi().zrem(GEO_KEY, riderId).del(presenceKey(riderId)).exec();
  },

  async isOnline(riderId: string) {
    return (await redis.exists(presenceKey(riderId))) === 1;
  },

  async onlineSet(riderIds: string[]): Promise<Set<string>> {
    if (!riderIds.length) return new Set();
    const pipeline = redis.pipeline();
    riderIds.forEach((id) => pipeline.exists(presenceKey(id)));
    const results = (await pipeline.exec()) ?? [];
    return new Set(riderIds.filter((_, i) => results[i]?.[1] === 1));
  },

  async lastLocation(riderId: string): Promise<(GeoPoint & { at: number }) | null> {
    const raw = await redis.get(presenceKey(riderId));
    return raw ? JSON.parse(raw) : null;
  },

  /** Online riders within `radiusKm` of a point, nearest first. Stale GEO entries are pruned. */
  async nearby(point: GeoPoint, radiusKm: number, limit = 30): Promise<NearbyRider[]> {
    const raw = (await redis.geosearch(
      GEO_KEY, 'FROMLONLAT', point.lng, point.lat, 'BYRADIUS', radiusKm, 'km', 'ASC', 'COUNT', limit, 'WITHDIST',
    )) as [string, string][];

    const candidates = raw.map(([riderId, dist]) => ({ riderId, distanceKm: Number(dist) }));
    const online = await this.onlineSet(candidates.map((c) => c.riderId));
    const stale = candidates.filter((c) => !online.has(c.riderId)).map((c) => c.riderId);
    if (stale.length) await redis.zrem(GEO_KEY, ...stale);
    return candidates.filter((c) => online.has(c.riderId));
  },

  async allOnline(): Promise<(GeoPoint & { riderId: string })[]> {
    const ids = await redis.zrange(GEO_KEY, 0, -1);
    const online = [...(await this.onlineSet(ids))];
    if (!online.length) return [];
    const positions = await redis.geopos(GEO_KEY, ...online);
    return online.flatMap((riderId, i) => {
      const pos = positions[i];
      return pos ? [{ riderId, lng: Number(pos[0]), lat: Number(pos[1]) }] : [];
    });
  },
};
