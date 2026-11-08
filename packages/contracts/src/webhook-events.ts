import type { ShipmentStatus, ShipmentWebhookEvent, WebhookEvent } from './enums';

export type WebhookEventGroup =
  'Booking' | 'Rider' | 'On the move' | 'Outcome' | 'Billing' | 'Warehouse';

/** Human-facing copy for every webhook event: admin console, developer docs, payload `title`. */
export const WEBHOOK_EVENT_META: Record<
  WebhookEvent,
  { title: string; description: string; group: WebhookEventGroup }
> = {
  'shipment.created': {
    title: 'New booking',
    description: 'A shipment was booked for this account — via the API or by Estene staff.',
    group: 'Booking',
  },
  'shipment.cancelled': {
    title: 'Cancelled',
    description: 'The shipment was cancelled before pickup.',
    group: 'Booking',
  },
  'shipment.rider_assigned': {
    title: 'Rider assigned',
    description: 'A rider accepted the job.',
    group: 'Rider',
  },
  'shipment.rider_unassigned': {
    title: 'Rider removed',
    description: 'The rider was taken off the job; we are finding another.',
    group: 'Rider',
  },
  'shipment.rider_en_route': {
    title: 'Rider heading to pickup',
    description: 'The rider is on the way to collect the parcel.',
    group: 'Rider',
  },
  'shipment.picked_up': {
    title: 'Picked up',
    description: 'The parcel was collected, tagged and its price confirmed.',
    group: 'On the move',
  },
  'shipment.in_transit': {
    title: 'In transit',
    description: 'The parcel is moving between zones.',
    group: 'On the move',
  },
  'shipment.at_hub': {
    title: 'At Estene office',
    description:
      'The parcel is at an Estene office — after drop-off, or on arrival in the destination city.',
    group: 'On the move',
  },
  'shipment.out_for_delivery': {
    title: 'Out for delivery',
    description: 'The rider is taking the parcel to the recipient.',
    group: 'On the move',
  },
  'shipment.ready_for_collection': {
    title: 'Ready for collection',
    description: 'Waiting at the destination office for the recipient to collect.',
    group: 'Outcome',
  },
  'shipment.delivered': {
    title: 'Delivered',
    description: 'Handed over, with PIN or photo proof.',
    group: 'Outcome',
  },
  'shipment.collected': {
    title: 'Collected',
    description: 'The recipient collected it at the office, with their PIN.',
    group: 'Outcome',
  },
  'shipment.delivery_failed': {
    title: 'Delivery attempt failed',
    description: 'The rider could not complete the handover; a re-attempt follows.',
    group: 'Outcome',
  },
  'shipment.returned': {
    title: 'Returned to sender',
    description: 'The parcel went back to the pickup address.',
    group: 'Outcome',
  },
  'shipment.price_adjusted': {
    title: 'Price changed at pickup',
    description: 'The rider found a different size or weight and the price was recalculated.',
    group: 'Billing',
  },
  'order.created': {
    title: 'Order received',
    description:
      'A warehouse order was created. Its status says whether stock was reserved or it is waiting for stock.',
    group: 'Warehouse',
  },
  'order.stock_reserved': {
    title: 'Order ready to pick',
    description: 'Stock arrived for an order that was waiting, and it was reserved.',
    group: 'Warehouse',
  },
  'order.shipped': {
    title: 'Order shipped',
    description:
      'The order was packed and handed in as a shipment. The tracking number is attached.',
    group: 'Warehouse',
  },
  'order.delivered': {
    title: 'Order delivered',
    description: 'The order’s shipment was delivered or collected.',
    group: 'Warehouse',
  },
  'order.returned': {
    title: 'Order returned',
    description: 'The order’s shipment came back to the warehouse.',
    group: 'Warehouse',
  },
  'order.cancelled': {
    title: 'Order cancelled',
    description: 'The order was cancelled and its stock released.',
    group: 'Warehouse',
  },
  'inbound.received': {
    title: 'Stock received',
    description:
      'The warehouse counted an inbound delivery. Received and damaged counts are attached.',
    group: 'Warehouse',
  },
  'stock.low': {
    title: 'Stock running low',
    description: 'A product’s available stock fell to or below your low-stock threshold.',
    group: 'Warehouse',
  },
};

/** Titles for non-subscribable events that still appear in delivery logs. */
export const SYSTEM_EVENT_TITLES: Record<string, string> = { ping: 'Test event' };

export const webhookEventTitle = (type: string) =>
  WEBHOOK_EVENT_META[type as WebhookEvent]?.title ?? SYSTEM_EVENT_TITLES[type] ?? type;

/**
 * Which event a status change produces, or null when integrators don't hear
 * about it. `created` is reached at booking (sent separately as
 * `shipment.created`), after online payment clears (no event — business
 * clients don't prepay online), or when a rider is taken off the job.
 */
export function webhookEventForStatus(
  from: ShipmentStatus,
  to: ShipmentStatus,
): ShipmentWebhookEvent | null {
  if (to === 'created') return from === 'awaiting_payment' ? null : 'shipment.rider_unassigned';
  // A last-mile rider taken off the job leaves the parcel at the office.
  if (to === 'at_hub' && from === 'assigned') return 'shipment.rider_unassigned';
  const map: Record<
    Exclude<ShipmentStatus, 'created' | 'awaiting_payment'>,
    ShipmentWebhookEvent
  > = {
    assigned: 'shipment.rider_assigned',
    en_route_to_pickup: 'shipment.rider_en_route',
    picked_up: 'shipment.picked_up',
    in_transit: 'shipment.in_transit',
    at_hub: 'shipment.at_hub',
    out_for_delivery: 'shipment.out_for_delivery',
    ready_for_collection: 'shipment.ready_for_collection',
    delivered: 'shipment.delivered',
    collected: 'shipment.collected',
    delivery_failed: 'shipment.delivery_failed',
    returned: 'shipment.returned',
    cancelled: 'shipment.cancelled',
  };
  return to === 'awaiting_payment' ? null : map[to];
}
