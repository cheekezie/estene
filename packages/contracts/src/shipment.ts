import { z } from 'zod';
import {
  CLIENT_PAYMENT_METHODS,
  CUSTOMER_PAYMENT_METHODS,
  SHIPMENT_STATUSES,
  PARCEL_SIZES,
  PAYMENT_METHODS,
  SERVICE_LEVELS,
  type ShipmentSource,
  type DeliveryProofMethod,
  type ShipmentStatus,
  type ParcelSize,
  type PaymentMethod,
  type PaymentStatus,
  type ServiceLevel,
} from './enums';
import {
  GeoPointSchema,
  NigerianPhoneSchema,
  ObjectIdSchema,
  PaginationQuerySchema,
} from './common';
import type { Quote } from './pricing';
import type { VirtualAccountDto } from './payment';

const ParcelDetailsSchema = z.object({
  size: z.enum(PARCEL_SIZES),
  weightKg: z.number().positive().max(100),
  description: z.string().trim().min(3).max(200),
  fragile: z.boolean().default(false),
  /** Declared value in kobo; drives optional goods protection. */
  declaredValue: z.number().int().nonnegative().default(0),
});

export const QuoteRequestSchema = z.object({
  pickupZoneId: ObjectIdSchema,
  dropoffZoneId: ObjectIdSchema,
  size: z.enum(PARCEL_SIZES),
  weightKg: z.number().positive().max(100),
  serviceLevel: z.enum(SERVICE_LEVELS).default('standard'),
  fragile: z.boolean().default(false),
  declaredValue: z.number().int().nonnegative().default(0),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

const StopSchema = z.object({
  contactName: z.string().trim().min(2),
  phone: NigerianPhoneSchema,
  zoneId: ObjectIdSchema,
  area: z.string().trim().min(2),
  address: z.string().trim().min(5).max(300),
  landmark: z.string().trim().max(120).optional(),
  location: GeoPointSchema.optional(),
});
export type StopInput = z.infer<typeof StopSchema>;

const ShipmentBaseSchema = z.object({
  pickup: StopSchema,
  dropoff: StopSchema,
  parcel: ParcelDetailsSchema,
  serviceLevel: z.enum(SERVICE_LEVELS).default('standard'),
  senderEmail: z.email().trim().toLowerCase().optional(),
  notes: z.string().trim().max(500).optional(),
});

/** What every shipment-creating path hands to the service, whichever channel it came from. */
export type NewShipmentInput = z.infer<typeof ShipmentBaseSchema> & {
  paymentMethod: z.infer<typeof PaymentMethodSchema>;
};
const PaymentMethodSchema = z.enum(PAYMENT_METHODS);

/** Public website booking. */
export const CreateShipmentSchema = ShipmentBaseSchema.extend({
  paymentMethod: z.enum(CUSTOMER_PAYMENT_METHODS),
}).refine((s) => s.paymentMethod !== 'online' || !!s.senderEmail, {
  path: ['senderEmail'],
  message: 'Add an email for your payment receipt',
});
export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>;

/** Phone booking keyed in by staff — optionally on behalf of a business client. */
export const AdminCreateShipmentSchema = ShipmentBaseSchema.extend({
  paymentMethod: PaymentMethodSchema,
  clientId: ObjectIdSchema.optional(),
}).refine((o) => o.paymentMethod !== 'on_account' || !!o.clientId, {
  path: ['paymentMethod'],
  message: 'Only business clients can be billed on account',
});
export type AdminCreateShipmentInput = z.infer<typeof AdminCreateShipmentSchema>;

/**
 * Integration API. `clientReference` is the client's own shipment id — sending
 * the same one twice returns the original shipment instead of creating a duplicate.
 */
export const ApiCreateShipmentSchema = ShipmentBaseSchema.extend({
  paymentMethod: z.enum(CLIENT_PAYMENT_METHODS).default('on_account'),
  clientReference: z.string().trim().min(1).max(64).optional(),
});
export type ApiCreateShipmentInput = z.infer<typeof ApiCreateShipmentSchema>;

export const ShipmentListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(SHIPMENT_STATUSES).optional(),
  clientId: ObjectIdSchema.optional(),
  zoneId: ObjectIdSchema.optional(),
  riderId: ObjectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ShipmentListQuery = z.infer<typeof ShipmentListQuerySchema>;

/** Rider at pickup: binds the QR tag and confirms (or corrects) the parcel. */
export const ConfirmPickupSchema = z.object({
  tagCode: z.string().trim().toUpperCase().min(6),
  size: z.enum(PARCEL_SIZES),
  weightKg: z.number().positive().max(100),
  description: z.string().trim().min(3).max(200).optional(),
  adjustmentReason: z.string().trim().min(5).max(300).optional(),
  photoUrl: z.url().optional(),
});
export type ConfirmPickupInput = z.infer<typeof ConfirmPickupSchema>;

/** Rider at drop-off: rescans the tag and proves delivery by recipient PIN or photo. */
export const ConfirmDeliverySchema = z
  .object({
    tagCode: z.string().trim().toUpperCase().min(6),
    method: z.enum(['pin', 'photo']),
    pin: z
      .string()
      .regex(/^\d{4}$/, 'PIN is 4 digits')
      .optional(),
    photoUrl: z.url().optional(),
    receivedBy: z.string().trim().max(80).optional(),
  })
  .refine((d) => (d.method === 'pin' ? !!d.pin : !!d.photoUrl), {
    message: 'Provide the recipient PIN or a delivery photo',
    path: ['method'],
  });
export type ConfirmDeliveryInput = z.infer<typeof ConfirmDeliverySchema>;

export const UpdateShipmentStatusSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  note: z.string().trim().max(300).optional(),
});

export const AssignRiderSchema = z.object({ riderId: ObjectIdSchema });

export type StopDto = Omit<StopInput, 'zoneId'> & {
  zone: { id: string; name: string; code: string };
};

export type ShipmentEventDto = {
  status: ShipmentStatus;
  note?: string;
  actor: string;
  at: string;
};

export type ShipmentDto = {
  id: string;
  trackingNumber: string;
  status: ShipmentStatus;
  source: ShipmentSource;
  client?: { id: string; name: string } | null;
  clientReference?: string;
  pickup: StopDto;
  dropoff: StopDto;
  parcel: {
    size: ParcelSize;
    weightKg: number;
    description: string;
    fragile: boolean;
    declaredValue: number;
  };
  serviceLevel: ServiceLevel;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  estimate: Quote;
  /** Set once the rider confirms the parcel at pickup. */
  finalAmount?: number;
  /** Kobo received so far across all successful payments. */
  amountPaid: number;
  /** Kobo still owed (0 when settled; negative = refund due). */
  balanceDue: number;
  adjustment?: { from: number; to: number; reason?: string; at: string };
  rider?: { id: string; name: string; phone: string; code: string } | null;
  tagCode?: string;
  proof?: { method: DeliveryProofMethod; photoUrl?: string; receivedBy?: string; at: string };
  events: ShipmentEventDto[];
  createdAt: string;
};

/** What anyone with a tracking number may see — no phone numbers, no addresses. */
export type PublicTrackingDto = {
  trackingNumber: string;
  status: ShipmentStatus;
  pickupArea: string;
  dropoffArea: string;
  serviceLevel: ServiceLevel;
  riderFirstName?: string;
  events: { status: ShipmentStatus; at: string }[];
  createdAt: string;
  /** Present while money is owed — lets the sender pay from the tracking page. */
  payment?: {
    balanceDue: number;
    reason: 'booking' | 'price_adjusted';
    virtualAccount: VirtualAccountDto | null;
  };
};

/**
 * The shipment as an integration client sees it (API responses and webhook
 * payloads). It's their shipment, so contacts are included — but never the
 * recipient PIN, internal ids of staff, or rider phone numbers.
 */
export type IntegrationShipmentDto = {
  id: string;
  trackingNumber: string;
  trackingUrl: string;
  clientReference: string | null;
  status: ShipmentStatus;
  statusLabel: string;
  pickup: {
    contactName: string;
    phone: string;
    area: string;
    address: string;
    landmark: string | null;
    zone: string;
  };
  dropoff: {
    contactName: string;
    phone: string;
    area: string;
    address: string;
    landmark: string | null;
    zone: string;
  };
  parcel: {
    size: ParcelSize;
    weightKg: number;
    description: string;
    fragile: boolean;
    declaredValue: number;
  };
  serviceLevel: ServiceLevel;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** All amounts in kobo. */
  amount: { estimate: number; final: number | null; currency: 'NGN' };
  priceAdjustment: { from: number; to: number; reason: string | null } | null;
  rider: { firstName: string } | null;
  proofOfDelivery: {
    method: DeliveryProofMethod;
    photoUrl: string | null;
    receivedBy: string | null;
    at: string;
  } | null;
  events: { status: ShipmentStatus; at: string; note: string | null }[];
  createdAt: string;
  updatedAt: string;
};
