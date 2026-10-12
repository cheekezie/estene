/**
 * Domain enums. Declared as `as const` tuples so the same list drives Zod
 * schemas, Mongoose enums and UI option lists without drifting.
 */

export const ORDER_STATUSES = [
  'created', // booked, waiting for a rider
  'assigned', // a rider accepted the job
  'en_route_to_pickup',
  'picked_up', // parcel scanned + tagged, price confirmed
  'in_transit',
  'at_hub', // inter-zone parcels staged at a hub
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returned',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

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

export const PAYMENT_METHODS = ['card', 'transfer', 'cash_on_pickup', 'cash_on_delivery'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** company = on payroll, uses company fleet. partner = independent; we take a commission per trip. */
export const RIDER_TYPES = ['company', 'partner'] as const;
export type RiderType = (typeof RIDER_TYPES)[number];

export const RIDER_STATUSES = ['pending', 'active', 'suspended'] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

export const VEHICLE_TYPES = ['bike', 'tricycle', 'car', 'van'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const ADMIN_ROLES = ['super_admin', 'ops_manager', 'dispatcher', 'finance', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Who is on the other end of a JWT. */
export const ACTOR_TYPES = ['admin', 'rider', 'customer'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const DELIVERY_PROOF_METHODS = ['pin', 'photo'] as const;
export type DeliveryProofMethod = (typeof DELIVERY_PROOF_METHODS)[number];

export const LEDGER_ENTRY_TYPES = [
  'order_charge', // what the customer owes for an order
  'payment_received', // customer paid (card/transfer/cash)
  'rider_earning', // partner rider's share of a trip
  'platform_revenue', // our income: full fare on company-rider trips, commission on partner trips
  'cash_collected', // rider holds customer cash — rider owes us
  'cash_remitted', // rider handed cash back
  'payout', // we paid a partner rider
  'adjustment',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];
