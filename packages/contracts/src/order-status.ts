import type { ActorType, OrderStatus } from './enums';

/**
 * The order lifecycle as an explicit state machine. Every status change in the
 * system goes through `canTransition` — the API refuses anything not listed
 * here, so an order can never skip from `created` to `delivered`.
 */

type Transition = { to: OrderStatus; by: readonly ActorType[] };

const TRANSITIONS: Record<OrderStatus, readonly Transition[]> = {
  created: [
    { to: 'assigned', by: ['admin', 'rider'] },
    { to: 'cancelled', by: ['admin', 'customer', 'client'] },
  ],
  assigned: [
    { to: 'en_route_to_pickup', by: ['rider'] },
    { to: 'created', by: ['admin', 'rider'] }, // unassign / rider declines after accepting
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
  ],
  in_transit: [
    { to: 'at_hub', by: ['rider', 'admin'] },
    { to: 'out_for_delivery', by: ['rider'] },
  ],
  at_hub: [{ to: 'out_for_delivery', by: ['rider', 'admin'] }],
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

export const canTransition = (from: OrderStatus, to: OrderStatus, actor: ActorType): boolean =>
  TRANSITIONS[from].some((t) => t.to === to && t.by.includes(actor));

export const nextStatuses = (from: OrderStatus, actor: ActorType): OrderStatus[] =>
  TRANSITIONS[from].filter((t) => t.by.includes(actor)).map((t) => t.to);

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['delivered', 'returned', 'cancelled'];
export const isTerminal = (s: OrderStatus) => TERMINAL_STATUSES.includes(s);

/** Statuses where a rider is actively holding or heading to the parcel. */
export const ACTIVE_RIDER_STATUSES: readonly OrderStatus[] = [
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
export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; description: string; tone: StatusTone; notify: boolean; notifyReceiver: boolean }
> = {
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
    label: 'At hub',
    description: 'Your parcel has arrived at a sorting hub.',
    tone: 'progress',
    notify: false,
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

/** The happy-path milestones shown as a progress tracker on the public site. */
export const TRACKING_MILESTONES: readonly OrderStatus[] = [
  'created',
  'assigned',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
];
