import type { WebhookEvent } from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import type { IntegrationShipmentDto } from '@estene/contracts/shipment';

export type SummaryExtra = { previousAmount?: number; amount?: number; reason?: string | null };

/**
 * One plain-English sentence per event, written so an integrator can forward it
 * to their own customer or ops channel unchanged.
 */
export function summarize(
  event: WebhookEvent,
  s: IntegrationShipmentDto,
  extra: SummaryExtra = {},
): string {
  const ref = `${s.trackingNumber}${s.clientReference ? ` (your ref ${s.clientReference})` : ''}`;
  const Id = `Shipment ${ref}`; // sentence start
  const id = `shipment ${ref}`; // mid-sentence
  const rider = s.rider?.firstName ?? 'The rider';
  const recipient = s.dropoff.contactName;

  switch (event) {
    case 'shipment.created':
      return `${Id} was booked: ${s.pickup.area} → ${s.dropoff.area}.`;
    case 'shipment.rider_assigned':
      return `${rider} accepted ${id}.`;
    case 'shipment.rider_unassigned':
      return `${Id} is back in the queue — we're finding another rider.`;
    case 'shipment.rider_en_route':
      return `${rider} is heading to ${s.pickup.area} to collect ${id}.`;
    case 'shipment.picked_up':
      return `${Id} was picked up in ${s.pickup.area}.`;
    case 'shipment.price_adjusted':
      return `The price of ${id} changed from ${formatNaira(extra.previousAmount ?? 0)} to ${formatNaira(extra.amount ?? 0)} at pickup${extra.reason ? `: ${extra.reason}` : ''}.`;
    case 'shipment.in_transit':
      return `${Id} is in transit to ${s.dropoff.area}.`;
    case 'shipment.at_hub':
      return `${Id} arrived at a sorting hub.`;
    case 'shipment.out_for_delivery':
      return `${Id} is out for delivery to ${recipient} in ${s.dropoff.area}.`;
    case 'shipment.delivered':
      return `${Id} was delivered to ${s.proofOfDelivery?.receivedBy ?? recipient} in ${s.dropoff.area}.`;
    case 'shipment.delivery_failed':
      return `We couldn't deliver ${id} to ${recipient}; the rider will try again.`;
    case 'shipment.returned':
      return `${Id} was returned to the sender.`;
    case 'shipment.cancelled':
      return `${Id} was cancelled.`;
  }
}
