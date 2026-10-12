import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import type { RiderDto, RiderInput, RiderUpdateInput } from '@estene/contracts/rider';
import type { RiderStatus } from '@estene/contracts/enums';
import { ACTIVE_RIDER_STATUSES } from '@estene/contracts/shipment-status';
import { randomCode, randomToken } from '../../lib/crypto';
import { searchRegex } from '../../lib/db';
import { conflict, notFound } from '../../lib/errors';
import { paginate } from '../../lib/response';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { RiderModel, type IRider } from './models/rider.model';
import { PresenceService } from './presence.service';

type PopulatedZone = { _id: Types.ObjectId; name: string; code: string } | null;

function toRiderDto(r: IRider, extra: { isOnline: boolean; activeJobs: number }): RiderDto {
  const zone = r.primaryZone as unknown as PopulatedZone;
  return {
    id: r._id.toString(),
    code: r.code,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    email: r.email,
    type: r.type,
    status: r.status,
    vehicleType: r.vehicleType,
    plateNumber: r.plateNumber,
    primaryZone:
      zone && 'name' in zone ? { id: zone._id.toString(), name: zone.name, code: zone.code } : null,
    coverageZoneIds: r.coverageZones.map(String),
    commissionPct: r.commissionPct,
    fleetName: r.fleetName,
    createdAt: r.createdAt.toISOString(),
    ...extra,
  };
}

/** Active job counts for many riders in one aggregate. */
export async function activeJobCounts(riderIds: (string | Types.ObjectId)[]) {
  const rows = await ShipmentModel.aggregate<{ _id: Types.ObjectId; n: number }>([
    {
      $match: {
        rider: { $in: riderIds.map((id) => new Types.ObjectId(id)) },
        status: { $in: ACTIVE_RIDER_STATUSES },
      },
    },
    { $group: { _id: '$rider', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.n]));
}

async function decorate(riders: IRider[]) {
  const ids = riders.map((r) => r._id.toString());
  const [online, jobs] = await Promise.all([PresenceService.onlineSet(ids), activeJobCounts(ids)]);
  return riders.map((r) =>
    toRiderDto(r, {
      isOnline: online.has(r._id.toString()),
      activeJobs: jobs.get(r._id.toString()) ?? 0,
    }),
  );
}

export const RidersService = {
  async list(q: {
    page: number;
    limit: number;
    search?: string;
    type?: string;
    status?: string;
    zoneId?: string;
  }) {
    const filter: Record<string, unknown> = {};
    if (q.type) filter.type = q.type;
    if (q.status) filter.status = q.status;
    if (q.zoneId) filter.$or = [{ primaryZone: q.zoneId }, { coverageZones: q.zoneId }];
    if (q.search) {
      const rx = searchRegex(q.search);
      filter.$and = [
        {
          $or: [
            { firstName: rx },
            { lastName: rx },
            { phone: rx },
            { code: rx },
            { fleetName: rx },
          ],
        },
      ];
    }
    const [riders, total] = await Promise.all([
      RiderModel.find(filter)
        .populate('primaryZone', 'name code')
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      RiderModel.countDocuments(filter),
    ]);
    return paginate(await decorate(riders), total, q.page, q.limit);
  },

  async get(id: string) {
    const rider = await RiderModel.findById(id).populate('primaryZone', 'name code');
    if (!rider) throw notFound('Rider not found');
    const [dto] = await decorate([rider]);
    return { ...dto!, lastLocation: await PresenceService.lastLocation(id) };
  },

  /**
   * Onboards a rider in `pending` status with a one-time password. The
   * password is returned once so ops can hand it over (or it is SMSed).
   */
  async create(input: RiderInput, adminId: string) {
    if (await RiderModel.exists({ phone: input.phone }))
      throw conflict('A rider with this phone number exists');
    const tempPassword = randomToken(6).slice(0, 8);
    const rider = await RiderModel.create({
      ...input,
      code: `RD-${randomCode(6)}`,
      primaryZone: input.primaryZoneId,
      coverageZones: [...new Set([input.primaryZoneId, ...input.coverageZoneIds])],
      passwordHash: await bcrypt.hash(tempPassword, 10),
      onboardedBy: adminId,
    });
    return { rider: await this.get(rider.id), tempPassword };
  },

  async update(id: string, input: RiderUpdateInput) {
    const { primaryZoneId, coverageZoneIds, ...rest } = input;
    const update: Record<string, unknown> = { ...rest };
    if (primaryZoneId) update.primaryZone = primaryZoneId;
    if (coverageZoneIds)
      update.coverageZones = [
        ...new Set([...(primaryZoneId ? [primaryZoneId] : []), ...coverageZoneIds]),
      ];
    const rider = await RiderModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!rider) throw notFound('Rider not found');
    return this.get(id);
  },

  async setStatus(id: string, status: RiderStatus) {
    const rider = await RiderModel.findByIdAndUpdate(id, { status }, { new: true });
    if (!rider) throw notFound('Rider not found');
    if (status !== 'active') await PresenceService.goOffline(id);
    return this.get(id);
  },

  async liveMap() {
    const online = await PresenceService.allOnline();
    const riders = await RiderModel.find(
      { _id: { $in: online.map((o) => o.riderId) } },
      'firstName lastName code type vehicleType',
    ).lean();
    const byId = new Map(riders.map((r) => [r._id.toString(), r]));
    return online.flatMap((o) => {
      const r = byId.get(o.riderId);
      return r
        ? [
            {
              ...o,
              name: `${r.firstName} ${r.lastName}`,
              code: r.code,
              type: r.type,
              vehicleType: r.vehicleType,
            },
          ]
        : [];
    });
  },
};
