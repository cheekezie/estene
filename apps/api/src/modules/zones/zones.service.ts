import type { ZoneDto, ZoneInput } from '@estene/contracts/zone';
import type { GeoPoint } from '@estene/contracts/common';
import { conflict, notFound } from '../../lib/errors';
import { ZoneModel, type IZone } from './models/zone.model';

export const toZoneDto = (z: IZone): ZoneDto => ({
  id: z._id.toString(),
  name: z.name,
  code: z.code,
  city: z.city,
  state: z.state ?? 'FCT',
  areas: z.areas,
  center: { lng: z.center.coordinates[0], lat: z.center.coordinates[1] },
  radiusKm: z.radiusKm,
  intraZoneFare: z.intraZoneFare,
  isActive: z.isActive,
  createdAt: z.createdAt.toISOString(),
});

const toDoc = (input: Partial<ZoneInput>) => {
  const { center, ...rest } = input;
  return center
    ? { ...rest, center: { type: 'Point' as const, coordinates: [center.lng, center.lat] } }
    : rest;
};

export const ZonesService = {
  async list(opts: { activeOnly?: boolean } = {}) {
    const zones = await ZoneModel.find(opts.activeOnly ? { isActive: true } : {}).sort({ name: 1 });
    return zones.map(toZoneDto);
  },

  async get(id: string) {
    const zone = await ZoneModel.findById(id);
    if (!zone) throw notFound('Zone not found');
    return zone;
  },

  async create(input: ZoneInput) {
    if (await ZoneModel.exists({ code: input.code }))
      throw conflict(`Zone code ${input.code} is taken`);
    return toZoneDto(await ZoneModel.create(toDoc(input)));
  },

  async update(id: string, input: Partial<ZoneInput>) {
    const zone = await ZoneModel.findByIdAndUpdate(id, toDoc(input), {
      new: true,
      runValidators: true,
    });
    if (!zone) throw notFound('Zone not found');
    return toZoneDto(zone);
  },

  /** The active zone whose centre is nearest to a point and whose radius contains it. */
  async findByPoint(point: GeoPoint) {
    const [zone] = await ZoneModel.aggregate<IZone & { distanceKm: number }>([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [point.lng, point.lat] },
          distanceField: 'distanceKm',
          distanceMultiplier: 0.001,
          query: { isActive: true },
        },
      },
      { $match: { $expr: { $lte: ['$distanceKm', '$radiusKm'] } } },
      { $limit: 1 },
    ]);
    return zone ?? null;
  },
};
