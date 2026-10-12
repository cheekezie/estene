import type { FilterQuery, Types } from 'mongoose';
import type { CreateManifestInput, ManifestDto } from '@estene/contracts/manifest';
import { randomCode } from '../../lib/crypto';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { paginate } from '../../lib/response';
import { OfficeModel } from '../offices/models/office.model';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { ShipmentsService, type Actor } from '../shipments/shipments.service';
import { ManifestModel, type IManifest } from './models/manifest.model';

type OfficeRef = { _id: Types.ObjectId; name: string; code: string; zone?: { city?: string } };
type ShipRef = {
  _id: Types.ObjectId;
  trackingNumber: string;
  tagCode?: string;
  status: ManifestDto['shipments'][number]['status'];
  dropoff: { area: string };
};

const POPULATE = [
  { path: 'fromOffice', select: 'name code zone', populate: { path: 'zone', select: 'city' } },
  { path: 'toOffice', select: 'name code zone', populate: { path: 'zone', select: 'city' } },
  { path: 'shipments.shipment', select: 'trackingNumber tagCode status dropoff.area' },
  { path: 'createdBy', select: 'name' },
];

const office = (v: unknown) => {
  const o = v as OfficeRef;
  return { id: o._id.toString(), name: o.name, code: o.code, city: o.zone?.city ?? '' };
};

function toDto(m: IManifest): ManifestDto {
  const by = m.createdBy as unknown as { _id: Types.ObjectId; name: string } | undefined;
  const shipments = m.shipments.map((e) => {
    const s = e.shipment as unknown as ShipRef;
    return {
      id: s._id.toString(),
      trackingNumber: s.trackingNumber,
      tagCode: s.tagCode,
      status: s.status,
      received: !!e.receivedAt,
      destinationArea: s.dropoff?.area ?? '',
    };
  });
  return {
    id: m._id.toString(),
    code: m.code,
    status: m.status,
    from: office(m.fromOffice),
    to: office(m.toOffice),
    carrier: { ...m.carrier },
    note: m.note,
    shipments,
    counts: { total: shipments.length, received: shipments.filter((s) => s.received).length },
    createdBy: by?.name ? { id: by._id.toString(), name: by.name } : null,
    departedAt: m.departedAt?.toISOString() ?? null,
    arrivedAt: m.arrivedAt?.toISOString() ?? null,
    closedAt: m.closedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

async function load(id: string) {
  const m = await ManifestModel.findById(id);
  if (!m) throw notFound('Manifest not found');
  return m;
}

/** Scan input: a QR tag code or a tracking number. */
export async function findByCode(code: string) {
  const c = code.trim().toUpperCase();
  return ShipmentModel.findOne({ $or: [{ tagCode: c }, { trackingNumber: c }] });
}

export const ManifestsService = {
  toDto,

  async get(id: string) {
    const m = await ManifestModel.findById(id).populate(POPULATE);
    if (!m) throw notFound('Manifest not found');
    return toDto(m);
  },

  async list(q: { page: number; limit: number; status?: string; officeId?: string }) {
    const filter: FilterQuery<IManifest> = {};
    if (q.status) filter.status = q.status;
    if (q.officeId) filter.$or = [{ fromOffice: q.officeId }, { toOffice: q.officeId }];
    const [rows, total] = await Promise.all([
      ManifestModel.find(filter)
        .populate(POPULATE)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      ManifestModel.countDocuments(filter),
    ]);
    return paginate(rows.map(toDto), total, q.page, q.limit);
  },

  async create(input: CreateManifestInput, adminId: string) {
    const [from, to] = await Promise.all([
      OfficeModel.findById(input.fromOfficeId, 'code'),
      OfficeModel.findById(input.toOfficeId, 'code'),
    ]);
    if (!from || !to) throw notFound('Office not found');
    const { fromOfficeId, toOfficeId, note, carrierType, ...carrier } = input;
    const m = await ManifestModel.create({
      code: `MF-${from.code.split('-')[0]}-${to.code.split('-')[0]}-${randomCode(5)}`,
      fromOffice: fromOfficeId,
      toOffice: toOfficeId,
      carrier: { type: carrierType, ...carrier },
      note,
      createdBy: adminId,
    });
    return this.get(m.id);
  },

  async updateCarrier(id: string, input: Partial<IManifest['carrier']> & { note?: string }) {
    const m = await load(id);
    if (m.status !== 'open') throw badRequest('Carrier details can’t change after departure');
    const { note, ...carrier } = input;
    m.carrier = { ...m.carrier, ...carrier };
    if (note !== undefined) m.note = note;
    await m.save();
    return this.get(id);
  },

  /** Load a parcel (by scan) onto an open manifest. It must be at the origin office and heading to the destination office. */
  async addShipment(id: string, code: string) {
    const m = await load(id);
    if (m.status !== 'open') throw badRequest('This manifest has already left');
    const s = await findByCode(code);
    if (!s) throw notFound('No parcel matches that code');
    if (s.status !== 'at_hub' || String(s.currentOffice) !== String(m.fromOffice))
      throw badRequest(`${s.trackingNumber} isn’t checked in at this office`, 'NOT_AT_OFFICE');
    if (String(s.fulfilment?.destinationOffice) !== String(m.toOffice))
      throw badRequest(`${s.trackingNumber} is going to a different office`, 'WRONG_DESTINATION');
    if (s.manifest) {
      if (String(s.manifest) === id)
        throw conflict(`${s.trackingNumber} is already on this manifest`);
      throw conflict(`${s.trackingNumber} is already on another manifest`);
    }
    await ManifestModel.updateOne(
      { _id: id, status: 'open' },
      { $push: { shipments: { shipment: s._id, addedAt: new Date() } } },
    );
    await ShipmentModel.updateOne({ _id: s._id }, { manifest: m._id });
    return this.get(id);
  },

  async removeShipment(id: string, shipmentId: string) {
    const m = await load(id);
    if (m.status !== 'open') throw badRequest('This manifest has already left');
    await ManifestModel.updateOne({ _id: id }, { $pull: { shipments: { shipment: shipmentId } } });
    await ShipmentModel.updateOne({ _id: shipmentId, manifest: m._id }, { manifest: null });
    return this.get(id);
  },

  /** Seal and send: every parcel moves to in_transit and leaves office custody. */
  async depart(id: string, actor: Actor) {
    const m = await load(id);
    if (m.status !== 'open') throw badRequest('Already departed');
    if (!m.shipments.length) throw badRequest('Add at least one parcel before departure');
    if (m.carrier.type === 'partner' && !m.carrier.waybillNumber)
      throw badRequest('Add the carrier’s waybill number before departure', 'WAYBILL_REQUIRED');
    for (const e of m.shipments) {
      await ShipmentsService.transition(e.shipment.toString(), 'in_transit', actor, {
        note: `On manifest ${m.code}`,
        set: { $set: { currentOffice: null } },
      });
    }
    m.status = 'in_transit';
    m.departedAt = new Date();
    await m.save();
    return this.get(id);
  },

  /** Destination office checks one parcel in (scan). Closes the manifest once everything is in. */
  async receive(id: string, code: string, actor: Actor) {
    const m = await load(id);
    if (m.status !== 'in_transit' && m.status !== 'arrived')
      throw badRequest('This manifest isn’t on the road');
    const s = await findByCode(code);
    const entry = s && m.shipments.find((e) => String(e.shipment) === String(s._id));
    if (!s || !entry) throw badRequest('That parcel isn’t on this manifest', 'NOT_ON_MANIFEST');
    if (entry.receivedAt) throw conflict(`${s.trackingNumber} was already checked in`);
    await this.checkIn(m, s._id, actor);
    return this.get(id);
  },

  /** Check every remaining parcel in at once (count verified by hand). */
  async receiveAll(id: string, actor: Actor) {
    const m = await load(id);
    if (m.status !== 'in_transit' && m.status !== 'arrived')
      throw badRequest('This manifest isn’t on the road');
    for (const e of m.shipments.filter((x) => !x.receivedAt))
      await this.checkIn(m, e.shipment, actor);
    return this.get(id);
  },

  async checkIn(m: IManifest, shipmentId: Types.ObjectId, actor: Actor) {
    await ShipmentsService.transition(shipmentId.toString(), 'at_hub', actor, {
      note: `Arrived on manifest ${m.code}`,
      set: { $set: { currentOffice: m.toOffice, manifest: null } },
    });
    const now = new Date();
    const updated = await ManifestModel.findOneAndUpdate(
      { _id: m._id, 'shipments.shipment': shipmentId },
      { $set: { 'shipments.$.receivedAt': now, status: 'arrived' }, $min: { arrivedAt: now } },
      { new: true },
    );
    if (updated && updated.shipments.every((e) => e.receivedAt)) {
      await ManifestModel.updateOne({ _id: m._id }, { status: 'closed', closedAt: now });
    }
  },
};
