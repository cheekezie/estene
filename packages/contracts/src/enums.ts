/**
 * Domain enums. Declared as `as const` tuples so the same list drives Zod
 * schemas, Mongoose enums and UI option lists without drifting.
 */

export const SHIPMENT_STATUSES = [
  'awaiting_payment', // booked with online payment; dispatch starts once paid
  'created', // booked (and paid, if prepaid): waiting for a rider, or for the sender to drop it at an office
  'assigned', // a rider accepted the job
  'en_route_to_pickup',
  'picked_up', // parcel scanned + tagged, price confirmed
  'in_transit', // moving — locally with a rider, or between states on a manifest
  'at_hub', // in the custody of an Estene office (origin or destination)
  'out_for_delivery',
  'ready_for_collection', // at the destination office, waiting for the recipient
  'delivered',
  'collected', // recipient picked it up at the office
  'delivery_failed',
  'returned',
  'cancelled',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const PARCEL_SIZES = ['envelope', 'small', 'medium', 'large', 'xlarge'] as const;
export type ParcelSize = (typeof PARCEL_SIZES)[number];

export const PARCEL_SIZE_META: Record<ParcelSize, { label: string; hint: string; maxKg: number }> =
  {
    envelope: { label: 'Envelope', hint: 'Documents, letters — up to A4', maxKg: 0.5 },
    small: { label: 'Small', hint: 'Shoebox size — fits in a backpack', maxKg: 2 },
    medium: { label: 'Medium', hint: 'Carton up to 40 × 30 × 30 cm', maxKg: 10 },
    large: { label: 'Large', hint: 'Fits on a bike carrier box', maxKg: 20 },
    xlarge: { label: 'Extra large', hint: 'Needs a van or tricycle', maxKg: 50 },
  };

export const SERVICE_LEVELS = ['standard', 'express', 'same_day'] as const;
export type ServiceLevel = (typeof SERVICE_LEVELS)[number];

export const SERVICE_LEVEL_META: Record<ServiceLevel, { label: string; hint: string }> = {
  standard: { label: 'Standard', hint: 'Delivered within 24–48 hours' },
  express: { label: 'Express', hint: 'Delivered within 6 hours' },
  same_day: { label: 'Same day', hint: 'Book before 2pm, delivered today' },
};

export const PAYMENT_METHODS = [
  'online', // hosted gateway checkout: card, USSD or transfer, paid before dispatch
  'transfer', // a dedicated account number to send money to, paid before dispatch
  'cash_on_pickup',
  'cash_on_delivery',
  'on_account',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Methods that must be settled before a rider is dispatched. */
export const PREPAID_METHODS: readonly PaymentMethod[] = ['online', 'transfer'];
export const isPrepaid = (m: PaymentMethod) => PREPAID_METHODS.includes(m);

/** What a walk-in/web customer may choose. `on_account` is only for business clients. */
export const CUSTOMER_PAYMENT_METHODS = [
  'online',
  'transfer',
  'cash_on_pickup',
  'cash_on_delivery',
] as const;

/** Business clients are invoiced; they can also let the rider collect cash. */
export const CLIENT_PAYMENT_METHODS = ['on_account', 'cash_on_pickup', 'cash_on_delivery'] as const;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  online: 'Paid online',
  transfer: 'Bank transfer to account',
  cash_on_pickup: 'Cash at pickup',
  cash_on_delivery: 'Cash on delivery',
  on_account: 'On account (invoiced)',
};

/** Where an shipment came from. */
export const SHIPMENT_SOURCES = ['web', 'admin', 'api'] as const;
export type ShipmentSource = (typeof SHIPMENT_SOURCES)[number];

export const CLIENT_STATUSES = ['active', 'suspended'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/**
 * Webhook events a business client can subscribe to — one per milestone, so an
 * integrator can listen for just `shipment.delivered` if that's all they need.
 * Machine names never change once published; titles are for humans.
 */
export const WEBHOOK_EVENTS = [
  'shipment.created',
  'shipment.rider_assigned',
  'shipment.rider_unassigned',
  'shipment.rider_en_route',
  'shipment.picked_up',
  'shipment.price_adjusted',
  'shipment.in_transit',
  'shipment.at_hub',
  'shipment.out_for_delivery',
  'shipment.ready_for_collection',
  'shipment.delivered',
  'shipment.collected',
  'shipment.delivery_failed',
  'shipment.returned',
  'shipment.cancelled',
  // Warehousing clients only.
  'order.created',
  'order.stock_reserved',
  'order.shipped',
  'order.delivered',
  'order.returned',
  'order.cancelled',
  'inbound.received',
  'stock.low',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export type ShipmentWebhookEvent = Extract<WebhookEvent, `shipment.${string}`>;
export type WarehouseWebhookEvent = Exclude<WebhookEvent, ShipmentWebhookEvent>;

/**
 * Derived from amount paid vs. amount owed. `partially_paid` happens when the
 * rider raises the price at pickup; `overpaid` when it drops (refund due).
 */
export const PAYMENT_STATUSES = [
  'unpaid',
  'partially_paid',
  'paid',
  'overpaid',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** company = on payroll, uses company fleet. partner = independent; we take a commission per trip. */
export const RIDER_TYPES = ['company', 'partner'] as const;
export type RiderType = (typeof RIDER_TYPES)[number];

export const RIDER_STATUSES = ['pending', 'active', 'suspended'] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

export const VEHICLE_TYPES = ['bike', 'tricycle', 'car', 'van'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** How the parcel reaches Estene: a rider collects it, or the sender brings it to an office. */
export const ORIGIN_MODES = ['pickup', 'dropoff'] as const;
export type OriginMode = (typeof ORIGIN_MODES)[number];

/** How it reaches the recipient: a rider delivers it, or they collect it at an office. */
export const DELIVERY_MODES = ['door', 'collection'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** A batch of parcels moving between two offices (line-haul). */
export const MANIFEST_STATUSES = ['open', 'in_transit', 'arrived', 'closed'] as const;
export type ManifestStatus = (typeof MANIFEST_STATUSES)[number];

/** own_vehicle = an Estene van/truck and driver; partner = a transport company with its own waybill. */
export const CARRIER_TYPES = ['own_vehicle', 'partner'] as const;
export type CarrierType = (typeof CARRIER_TYPES)[number];

export const ADMIN_ROLES = [
  'super_admin',
  'ops_manager',
  'dispatcher',
  'finance',
  'support',
  'office_agent', // runs an office counter: drop-offs, manifests, collections
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Who is on the other end of a JWT. */
/** `client` = a business integration acting through an API key. */
export const ACTOR_TYPES = ['admin', 'rider', 'customer', 'client'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const DELIVERY_PROOF_METHODS = ['pin', 'photo'] as const;
export type DeliveryProofMethod = (typeof DELIVERY_PROOF_METHODS)[number];

export const LEDGER_ENTRY_TYPES = [
  'shipment_charge', // what the customer owes for an shipment
  'payment_received', // customer paid (card/transfer/cash)
  'rider_earning', // partner rider's share of a trip
  'platform_revenue', // our income: full fare on company-rider trips, commission on partner trips
  'cash_collected', // rider holds customer cash — rider owes us
  'cash_remitted', // rider handed cash back
  'payout', // we paid a partner rider
  'storage_fee', // monthly warehousing fee billed to a business client
  'adjustment',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];
