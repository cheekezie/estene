import type { Types } from 'mongoose';
import type { ShipmentDto, PublicTrackingDto, StopDto } from '@estene/contracts/shipment';
import type { IShipment, IStop } from './models/shipment.model';

type ZoneRef = { _id: Types.ObjectId; name: string; code: string };
type RiderRef = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  phone: string;
  code: string;
};

/** Shipments are always loaded with `.populate(SHIPMENT_POPULATE)` before mapping. */
export const SHIPMENT_POPULATE = [
  { path: 'pickup.zone', select: 'name code' },
  { path: 'dropoff.zone', select: 'name code' },
  { path: 'rider', select: 'firstName lastName phone code' },
  { path: 'client', select: 'name' },
  ...(['fulfilment.originOffice', 'fulfilment.destinationOffice', 'currentOffice'] as const).map(
    (path) => ({
      path,
      select: 'name code zone address landmark phone openingHours',
      populate: { path: 'zone', select: 'city state' },
    }),
  ),
  { path: 'manifest', select: 'code' },
];

type OfficeRef = {
  _id: Types.ObjectId;
  name: string;
  code: string;
  address: string;
  landmark?: string;
  phone: string;
  openingHours: string;
  zone?: { city?: string };
};
const asOffice = (v: unknown) =>
  v && typeof v === 'object' && 'code' in v ? (v as OfficeRef) : null;
const officeRef = (v: unknown) => {
  const o = asOffice(v);
  return o ? { id: o._id.toString(), name: o.name, code: o.code, city: o.zone?.city ?? '' } : null;
};

export function toFulfilmentDto(o: IShipment): ShipmentDto['fulfilment'] {
  const f = o.fulfilment ?? { originMode: 'pickup', deliveryMode: 'door', interstate: false };
  const manifest = o.manifest as unknown as { _id: Types.ObjectId; code: string } | null;
  return {
    originMode: f.originMode,
    deliveryMode: f.deliveryMode,
    interstate: f.interstate,
    originOffice: officeRef(f.originOffice),
    destinationOffice: officeRef(f.destinationOffice),
    currentOffice: officeRef(o.currentOffice),
    manifest:
      manifest && 'code' in manifest ? { id: manifest._id.toString(), code: manifest.code } : null,
  };
}

const toStopDto = (s: IStop): StopDto => {
  const zone = s.zone as unknown as ZoneRef;
  return {
    contactName: s.contactName,
    phone: s.phone,
    area: s.area,
    address: s.address,
    landmark: s.landmark,
    location: s.location?.coordinates
      ? { lng: s.location.coordinates[0], lat: s.location.coordinates[1] }
      : undefined,
    zone: { id: zone._id.toString(), name: zone.name, code: zone.code },
  };
};

const clientRef = (o: IShipment) => {
  const c = o.client as unknown as { _id: Types.ObjectId; name: string } | null | undefined;
  return c && 'name' in c ? { id: c._id.toString(), name: c.name } : null;
};

export function toShipmentDto(o: IShipment): ShipmentDto {
  const rider = o.rider as unknown as RiderRef | null;
  return {
    id: o._id.toString(),
    trackingNumber: o.trackingNumber,
    status: o.status,
    source: o.source,
    client: clientRef(o),
    clientReference: o.clientReference,
    pickup: toStopDto(o.pickup),
    dropoff: toStopDto(o.dropoff),
    parcel: o.parcel,
    serviceLevel: o.serviceLevel,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    fulfilment: toFulfilmentDto(o),
    amountPaid: o.amountPaid ?? 0,
    balanceDue: payableAmount(o) - (o.amountPaid ?? 0),
    estimate: { lines: o.estimate.lines, subtotal: o.estimate.subtotal, total: o.estimate.total },
    finalAmount: o.finalAmount,
    // Unset nested paths come back as {} on hydrated docs — check a required field, not the object.
    adjustment: o.adjustment?.at
      ? {
          from: o.adjustment.from,
          to: o.adjustment.to,
          reason: o.adjustment.reason,
          at: o.adjustment.at.toISOString(),
        }
      : undefined,
    rider: rider
      ? {
          id: rider._id.toString(),
          name: `${rider.firstName} ${rider.lastName}`,
          phone: rider.phone,
          code: rider.code,
        }
      : null,
    tagCode: o.tagCode,
    proof: o.proof?.at ? { ...o.proof, at: o.proof.at.toISOString() } : undefined,
    events: o.events.map((e) => ({
      status: e.status,
      note: e.note,
      actor: e.actorType,
      at: e.at.toISOString(),
    })),
    createdAt: o.createdAt.toISOString(),
  };
}

export function toPublicTrackingDto(o: IShipment): PublicTrackingDto {
  const rider = o.rider as unknown as RiderRef | null;
  return {
    trackingNumber: o.trackingNumber,
    status: o.status,
    pickupArea: o.pickup.area,
    dropoffArea: o.dropoff.area,
    serviceLevel: o.serviceLevel,
    riderFirstName: rider?.firstName,
    events: o.events.map((e) => ({ status: e.status, at: e.at.toISOString() })),
    createdAt: o.createdAt.toISOString(),
    fulfilment: publicFulfilment(o),
  };
}

function publicFulfilment(o: IShipment): PublicTrackingDto['fulfilment'] {
  const f = o.fulfilment ?? { originMode: 'pickup', deliveryMode: 'door', interstate: false };
  const dest = f.deliveryMode === 'collection' ? asOffice(f.destinationOffice) : null;
  return {
    originMode: f.originMode,
    deliveryMode: f.deliveryMode,
    interstate: f.interstate,
    destinationOffice: dest
      ? {
          name: dest.name,
          address: dest.address,
          landmark: dest.landmark,
          phone: dest.phone,
          openingHours: dest.openingHours,
          city: dest.zone?.city ?? '',
        }
      : null,
  };
}

/** Amount the customer actually owes: the rider-confirmed price, else the estimate. */
export const payableAmount = (o: Pick<IShipment, 'finalAmount' | 'estimate'>) =>
  o.finalAmount ?? o.estimate.total;
