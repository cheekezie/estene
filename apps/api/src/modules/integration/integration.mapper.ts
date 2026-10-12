import type { Types } from 'mongoose';
import type { IntegrationShipmentDto } from '@estene/contracts/shipment';
import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { env } from '../../config/env';
import type { IShipment, IStop } from '../shipments/models/shipment.model';

type ZoneRef = { _id: Types.ObjectId; name: string; code: string };

const stop = (s: IStop) => ({
  contactName: s.contactName,
  phone: s.phone,
  area: s.area,
  address: s.address,
  landmark: s.landmark ?? null,
  zone: (s.zone as unknown as ZoneRef).code,
});

/**
 * The integration-facing shipment shape. Kept explicit and versioned with the
 * /v1 API: changing a field here is a breaking change for every integrator.
 * Expects an shipment populated with SHIPMENT_POPULATE.
 */
export function toIntegrationShipmentDto(
  o: IShipment & { updatedAt: Date },
): IntegrationShipmentDto {
  const rider = o.rider as unknown as { firstName: string } | null;
  return {
    id: o._id.toString(),
    trackingNumber: o.trackingNumber,
    trackingUrl: `${env.PUBLIC_SITE_URL}/track/${o.trackingNumber}`,
    clientReference: o.clientReference ?? null,
    status: o.status,
    statusLabel: SHIPMENT_STATUS_META[o.status].label,
    pickup: stop(o.pickup),
    dropoff: stop(o.dropoff),
    parcel: o.parcel,
    serviceLevel: o.serviceLevel,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    amount: { estimate: o.estimate.total, final: o.finalAmount ?? null, currency: 'NGN' },
    priceAdjustment: o.adjustment?.at
      ? { from: o.adjustment.from, to: o.adjustment.to, reason: o.adjustment.reason ?? null }
      : null,
    rider: rider && 'firstName' in rider ? { firstName: rider.firstName } : null,
    proofOfDelivery: o.proof?.at
      ? {
          method: o.proof.method,
          photoUrl: o.proof.photoUrl ?? null,
          receivedBy: o.proof.receivedBy ?? null,
          at: o.proof.at.toISOString(),
        }
      : null,
    events: o.events.map((e) => ({
      status: e.status,
      at: e.at.toISOString(),
      note: e.note ?? null,
    })),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}
