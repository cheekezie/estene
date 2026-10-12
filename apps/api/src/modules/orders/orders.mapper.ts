import type { Types } from 'mongoose';
import type { OrderDto, PublicTrackingDto, StopDto } from '@estene/contracts/order';
import type { IOrder, IStop } from './models/order.model';

type ZoneRef = { _id: Types.ObjectId; name: string; code: string };
type RiderRef = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  phone: string;
  code: string;
};

/** Orders are always loaded with `.populate(ORDER_POPULATE)` before mapping. */
export const ORDER_POPULATE = [
  { path: 'pickup.zone', select: 'name code' },
  { path: 'dropoff.zone', select: 'name code' },
  { path: 'rider', select: 'firstName lastName phone code' },
  { path: 'client', select: 'name' },
];

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

const clientRef = (o: IOrder) => {
  const c = o.client as unknown as { _id: Types.ObjectId; name: string } | null | undefined;
  return c && 'name' in c ? { id: c._id.toString(), name: c.name } : null;
};

export function toOrderDto(o: IOrder): OrderDto {
  const rider = o.rider as unknown as RiderRef | null;
  return {
    id: o._id.toString(),
    trackingNumber: o.trackingNumber,
    status: o.status,
    source: o.source,
    client: clientRef(o),
    externalReference: o.externalReference,
    pickup: toStopDto(o.pickup),
    dropoff: toStopDto(o.dropoff),
    parcel: o.parcel,
    serviceLevel: o.serviceLevel,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
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

export function toPublicTrackingDto(o: IOrder): PublicTrackingDto {
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
  };
}

/** Amount the customer actually owes: the rider-confirmed price, else the estimate. */
export const payableAmount = (o: Pick<IOrder, 'finalAmount' | 'estimate'>) =>
  o.finalAmount ?? o.estimate.total;
