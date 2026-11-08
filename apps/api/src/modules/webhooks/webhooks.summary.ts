import type { ShipmentWebhookEvent, WarehouseWebhookEvent } from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import type { IntegrationShipmentDto } from '@estene/contracts/shipment';
import type {
  IntegrationInboundDto,
  IntegrationOrderDto,
  IntegrationStockDto,
} from '@estene/contracts/warehouse';

export type SummaryExtra = { previousAmount?: number; amount?: number; reason?: string | null };

/**
 * One plain-English sentence per event, written so an integrator can forward it
 * to their own customer or ops channel unchanged.
 */
export function summarize(
  event: ShipmentWebhookEvent,
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
      return `${Id} is at an Estene office.`;
    case 'shipment.out_for_delivery':
      return `${Id} is out for delivery to ${recipient} in ${s.dropoff.area}.`;
    case 'shipment.ready_for_collection':
      return `${Id} is ready for ${recipient} to collect at the Estene office in ${s.dropoff.area}.`;
    case 'shipment.collected':
      return `${Id} was collected by ${s.proofOfDelivery?.receivedBy ?? recipient} at the Estene office.`;
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

// ── Warehousing ─────────────────────────────────────────────────────────────

type OrderLike = Pick<
  IntegrationOrderDto,
  'number' | 'reference' | 'status' | 'recipient' | 'shipment'
>;

export function summarizeOrder(
  event: Extract<WarehouseWebhookEvent, `order.${string}`>,
  o: OrderLike,
): string {
  const Id = `Order ${o.number}${o.reference ? ` (your ref ${o.reference})` : ''}`;
  switch (event) {
    case 'order.created':
      return o.status === 'awaiting_stock'
        ? `${Id} was received but is waiting for stock; it will be reserved when stock arrives.`
        : `${Id} was received and its stock reserved.`;
    case 'order.stock_reserved':
      return `Stock arrived for ${Id.replace(/^Order/, 'order')} and it is ready to pick.`;
    case 'order.shipped':
      return `${Id} was packed and shipped as ${o.shipment?.trackingNumber ?? 'a shipment'}.`;
    case 'order.delivered':
      return `${Id} was delivered to ${o.recipient.contactName}.`;
    case 'order.returned':
      return `${Id} came back to the warehouse undelivered.`;
    case 'order.cancelled':
      return `${Id} was cancelled.`;
  }
}

export function summarizeInbound(
  i: Pick<IntegrationInboundDto, 'number' | 'reference' | 'warehouse' | 'lines'>,
) {
  const received = i.lines.reduce((n, l) => n + l.receivedQty, 0);
  const damaged = i.lines.reduce((n, l) => n + l.damagedQty, 0);
  const ref = `${i.number}${i.reference ? ` (your ref ${i.reference})` : ''}`;
  return `Inbound ${ref} was counted at ${i.warehouse}: ${received} unit${received === 1 ? '' : 's'} received${damaged ? `, ${damaged} damaged` : ''}.`;
}

export function summarizeLowStock(
  s: Pick<IntegrationStockDto, 'sku' | 'name' | 'available' | 'warehouse'>,
) {
  return `${s.name} (${s.sku}) is running low at ${s.warehouse}: ${s.available} available.`;
}
