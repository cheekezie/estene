import type { Types } from 'mongoose';
import type { OfficeDto, OfficeInput, PublicOfficeDto } from '@estene/contracts/office';
import { conflict, notFound } from '../../lib/errors';
import { ZoneModel } from '../zones/models/zone.model';
import { OfficeModel, type IOffice } from './models/office.model';

type ZoneRef = { _id: Types.ObjectId; name: string; code: string; city: string; state?: string };
export const OFFICE_POPULATE = { path: 'zone', select: 'name code city state' };

export function toOfficeDto(o: IOffice): OfficeDto {
  const z = o.zone as unknown as ZoneRef;
  return {
    id: o._id.toString(),
    name: o.name,
    code: o.code,
    zone: {
      id: z._id.toString(),
      name: z.name,
      code: z.code,
      city: z.city,
      state: z.state ?? 'FCT',
    },
    area: o.area,
    address: o.address,
    landmark: o.landmark,
    phone: o.phone,
    openingHours: o.openingHours,
    location: o.location?.coordinates
      ? { lng: o.location.coordinates[0], lat: o.location.coordinates[1] }
      : undefined,
    isActive: o.isActive,
    createdAt: o.createdAt.toISOString(),
  };
}

const toPublic = (o: OfficeDto): PublicOfficeDto => ({
  id: o.id,
  name: o.name,
  code: o.code,
  area: o.area,
  address: o.address,
  landmark: o.landmark,
  phone: o.phone,
  openingHours: o.openingHours,
  zoneId: o.zone.id,
  city: o.zone.city,
  state: o.zone.state,
});

const toDoc = (input: Partial<OfficeInput>) => {
  const { zoneId, location, ...rest } = input;
  return {
    ...rest,
    ...(zoneId && { zone: zoneId }),
    ...(location && {
      location: { type: 'Point' as const, coordinates: [location.lng, location.lat] },
    }),
  };
};

export const OfficesService = {
  async list(opts: { activeOnly?: boolean } = {}) {
    const rows = await OfficeModel.find(opts.activeOnly ? { isActive: true } : {})
      .populate(OFFICE_POPULATE)
      .sort({ code: 1 });
    return rows.map(toOfficeDto);
  },

  async listPublic() {
    return (await this.list({ activeOnly: true })).map(toPublic);
  },

  async get(id: string) {
    const office = await OfficeModel.findById(id).populate(OFFICE_POPULATE);
    if (!office) throw notFound('Office not found');
    return office;
  },

  async create(input: OfficeInput) {
    if (await OfficeModel.exists({ code: input.code }))
      throw conflict(`Office code ${input.code} is taken`);
    if (!(await ZoneModel.exists({ _id: input.zoneId }))) throw notFound('Zone not found');
    const office = await OfficeModel.create(toDoc(input));
    return toOfficeDto(await this.get(office.id));
  },

  async update(id: string, input: Partial<OfficeInput>) {
    const office = await OfficeModel.findByIdAndUpdate(id, toDoc(input), {
      new: true,
      runValidators: true,
    }).populate(OFFICE_POPULATE);
    if (!office) throw notFound('Office not found');
    return toOfficeDto(office);
  },

  /**
   * The office a shipment routes through at one end when the customer didn't
   * pick one: an active office in the same zone, else any in the same state.
   */
  async nearestFor(zoneId: string) {
    const zone = await ZoneModel.findById(zoneId, 'state').lean();
    if (!zone) return null;
    const sameZone = await OfficeModel.findOne({ zone: zoneId, isActive: true });
    if (sameZone) return sameZone;
    const stateZones = await ZoneModel.find({ state: zone.state ?? 'FCT' }, '_id').lean();
    return OfficeModel.findOne({ zone: { $in: stateZones.map((z) => z._id) }, isActive: true });
  },
};
