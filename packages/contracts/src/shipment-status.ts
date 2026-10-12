import type { ActorType, ShipmentStatus } from './enums';

/**
 * The shipment lifecycle as an explicit state machine. Every status change in the
 * system goes through `canTransition` — the API refuses anything not listed
 * here, so an shipment can never skip from `created` to `delivered`.
 */

type Transition = { to: ShipmentStatus; by: readonly ActorType[] };

const TRANSITIONS: Record<ShipmentStatus, readonly Transition[]> = {
  // Only the payment system releases a shipment for dispatch.
  awaiting_payment: [{ to: 'cancelled', by: ['admin', 'customer'] }],
  created: [
    { to: 'assigned', by: ['admin', 'rider'] },
    { to: 'at_hub', by: ['admin'] }, // sender dropped it at an office
    { to: 'cancelled', by: ['admin', 'customer', 'client'] },
  ],
  assigned: [
    { to: 'en_route_to_pickup', by: ['rider'] },
    { to: 'created', by: ['admin', 'rider'] }, // unassign / rider declines after accepting
    { to: 'at_hub', by: ['admin', 'rider'] }, // last-mile rider taken off — parcel stays at the office
    { to: 'out_for_delivery', by: ['rider'] }, // last-mile rider collected it from the office
    { to: 'cancelled', by: ['admin', 'customer', 'client'] },
  ],
  en_route_to_pickup: [
    { to: 'picked_up', by: ['rider'] },
    { to: 'created', by: ['admin'] },
    { to: 'cancelled', by: ['admin'] },
  ],
  picked_up: [
    { to: 'in_transit', by: ['rider'] },
    { to: 'out_for_delivery', by: ['rider'] }, // same-zone trips go straight out
    { to: 'at_hub', by: ['admin'] }, // rider handed it in at an office
  ],
  in_transit: [
    { to: 'at_hub', by: ['rider', 'admin'] },
    { to: 'out_for_delivery', by: ['rider'] },
  ],
  at_hub: [
    { to: 'in_transit', by: ['admin'] }, // left on a manifest to another office
    { to: 'assigned', by: ['admin', 'rider'] }, // last-mile rider accepted
    { to: 'ready_for_collection', by: ['admin'] },
    { to: 'out_for_delivery', by: ['rider', 'admin'] },
    { to: 'returned', by: ['admin'] },
  ],
  ready_for_collection: [
    { to: 'collected', by: ['admin'] },
    { to: 'at_hub', by: ['admin'] }, // switched to door delivery, or moved
    { to: 'returned', by: ['admin'] }, // never collected
  ],
  collected: [],
  out_for_delivery: [
    { to: 'delivered', by: ['rider'] },
    { to: 'delivery_failed', by: ['rider'] },
  ],
  delivery_failed: [
    { to: 'out_for_delivery', by: ['rider', 'admin'] }, // re-attempt
    { to: 'returned', by: ['rider', 'admin'] },
  ],
  delivered: [],
  returned: [],
  cancelled: [],
};

export const canTransition = (
  from: ShipmentStatus,
  to: ShipmentStatus,
  actor: ActorType,
): boolean => TRANSITIONS[from].some((t) => t.to === to && t.by.includes(actor));

export const nextStatuses = (from: ShipmentStatus, actor: ActorType): ShipmentStatus[] =>
  TRANSITIONS[from].filter((t) => t.by.includes(actor)).map((t) => t.to);

export const TERMINAL_STATUSES: readonly ShipmentStatus[] = [
  'delivered',
  'collected',
  'returned',
  'cancelled',
];
export const isTerminal = (s: ShipmentStatus) => TERMINAL_STATUSES.includes(s);

/** Statuses where a rider is actively holding or heading to the parcel. */
export const ACTIVE_RIDER_STATUSES: readonly ShipmentStatus[] = [
  'assigned',
  'en_route_to_pickup',
  'picked_up',
  'in_transit',
  'out_for_delivery',
];

export type StatusTone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'error';

/**
 * Customer-facing copy per milestone. `notify` marks the milestones that
 * trigger a sender notification; `notifyReceiver` the ones the recipient hears about.
 */
export const SHIPMENT_STATUS_META: Record<
  ShipmentStatus,
  { label: string; description: string; tone: StatusTone; notify: boolean; notifyReceiver: boolean }
> = {
  awaiting_payment: {
    label: 'Awaiting payment',
    description: 'Your booking is saved. We dispatch a rider as soon as payment is confirmed.',
    tone: 'warning',
    notify: false,
    notifyReceiver: false,
  },
  created: {
    label: 'Booked',
    description: 'We have your booking and are finding a rider.',
    tone: 'neutral',
    notify: true,
    notifyReceiver: false,
  },
  assigned: {
    label: 'Rider assigned',
    description: 'A rider has accepted your delivery.',
    tone: 'info',
    notify: true,
    notifyReceiver: false,
  },
  en_route_to_pickup: {
    label: 'Rider on the way',
    description: 'Your rider is heading to the pickup address.',
    tone: 'info',
    notify: false,
    notifyReceiver: false,
  },
  picked_up: {
    label: 'Picked up',
    description: 'Your parcel has been collected and tagged.',
    tone: 'progress',
    notify: true,
    notifyReceiver: true,
  },
  in_transit: {
    label: 'In transit',
    description: 'Your parcel is moving through our network.',
    tone: 'progress',
    notify: true,
    notifyReceiver: false,
  },
  at_hub: {
    label: 'At Estene office',
    description: 'Your parcel is safely at an Estene office.',
    tone: 'progress',
    notify: true,
    notifyReceiver: false,
  },
  ready_for_collection: {
    label: 'Ready for collection',
    description:
      'Your parcel is waiting at the Estene office. Bring the delivery PIN to collect it.',
    tone: 'info',
    notify: true,
    notifyReceiver: true,
  },
  collected: {
    label: 'Collected',
    description: 'The parcel was collected at the Estene office.',
    tone: 'success',
    notify: true,
    notifyReceiver: false,
  },
  out_for_delivery: {
    label: 'Out for delivery',
    description: 'Your parcel is on its way to the recipient.',
    tone: 'progress',
    notify: true,
    notifyReceiver: true,
  },
  delivered: {
    label: 'Delivered',
    description: 'Your parcel has been delivered.',
    tone: 'success',
    notify: true,
    notifyReceiver: true,
  },
  delivery_failed: {
    label: 'Delivery attempt failed',
    description: 'We could not complete delivery. We will try again.',
    tone: 'warning',
    notify: true,
    notifyReceiver: true,
  },
  returned: {
    label: 'Returned to sender',
    description: 'The parcel has been returned to the sender.',
    tone: 'warning',
    notify: true,
    notifyReceiver: false,
  },
  cancelled: {
    label: 'Cancelled',
    description: 'This delivery was cancelled.',
    tone: 'error',
    notify: true,
    notifyReceiver: false,
  },
};

export type TrackingMilestone = {
  status: ShipmentStatus;
  /** Which occurrence of the status counts (interstate parcels hit `at_hub` twice). */
  occurrence: 1 | 2;
  label: string;
};

export type FulfilmentShape = {
  originMode: 'pickup' | 'dropoff';
  deliveryMode: 'door' | 'collection';
  interstate: boolean;
};

/** The happy-path steps shown on the tracking page, which depend on how the parcel travels. */
export function trackingMilestones(f: FulfilmentShape): TrackingMilestone[] {
  const viaOffice = f.originMode === 'dropoff' || f.deliveryMode === 'collection' || f.interstate;
  const steps: TrackingMilestone[] = [{ status: 'created', occurrence: 1, label: 'Booked' }];
  if (f.originMode === 'pickup') {
    steps.push(
      { status: 'assigned', occurrence: 1, label: 'Rider assigned' },
      { status: 'picked_up', occurrence: 1, label: 'Picked up' },
    );
  }
  if (!viaOffice) {
    steps.push({ status: 'in_transit', occurrence: 1, label: 'In transit' });
  } else {
    steps.push({
      status: 'at_hub',
      occurrence: 1,
      label: f.originMode === 'dropoff' ? 'Dropped off at office' : 'At Estene office',
    });
    if (f.interstate) {
      steps.push(
        { status: 'in_transit', occurrence: 1, label: 'On the way between states' },
        { status: 'at_hub', occurrence: 2, label: 'At destination office' },
      );
    }
  }
  if (f.deliveryMode === 'collection') {
    steps.push(
      { status: 'ready_for_collection', occurrence: 1, label: 'Ready for collection' },
      { status: 'collected', occurrence: 1, label: 'Collected' },
    );
  } else {
    steps.push(
      { status: 'out_for_delivery', occurrence: 1, label: 'Out for delivery' },
      { status: 'delivered', occurrence: 1, label: 'Delivered' },
    );
  }
  return steps;
}

/** Door-to-door within one city — the original flow. */
export const TRACKING_MILESTONES: readonly ShipmentStatus[] = trackingMilestones({
  originMode: 'pickup',
  deliveryMode: 'door',
  interstate: false,
}).map((m) => m.status);
