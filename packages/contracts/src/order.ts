import { z } from 'zod';
import {
  ORDER_STATUSES,
  PARCEL_SIZES,
  PAYMENT_METHODS,
  SERVICE_LEVELS,
  type DeliveryProofMethod,
  type OrderStatus,
  type ParcelSize,
  type PaymentMethod,
  type PaymentStatus,
  type ServiceLevel,
} from './enums';
import { GeoPointSchema, NigerianPhoneSchema, ObjectIdSchema, PaginationQuerySchema } from './common';
import type { Quote } from './pricing';

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

export const CreateOrderSchema = z.object({
  pickup: StopSchema,
  dropoff: StopSchema,
  parcel: ParcelDetailsSchema,
  serviceLevel: z.enum(SERVICE_LEVELS).default('standard'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  senderEmail: z.email().trim().toLowerCase().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export const OrderListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  zoneId: ObjectIdSchema.optional(),
  riderId: ObjectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;

/** Rider at pickup: binds the QR tag and confirms (or corrects) the parcel. */
export const ConfirmPickupSchema = z
  .object({
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
    pin: z.string().regex(/^\d{4}$/, 'PIN is 4 digits').optional(),
    photoUrl: z.url().optional(),
    receivedBy: z.string().trim().max(80).optional(),
  })
  .refine((d) => (d.method === 'pin' ? !!d.pin : !!d.photoUrl), {
    message: 'Provide the recipient PIN or a delivery photo',
    path: ['method'],
  });
export type ConfirmDeliveryInput = z.infer<typeof ConfirmDeliverySchema>;

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional(),
});

export const AssignRiderSchema = z.object({ riderId: ObjectIdSchema });

export type StopDto = Omit<StopInput, 'zoneId'> & { zone: { id: string; name: string; code: string } };

export type OrderEventDto = {
  status: OrderStatus;
  note?: string;
  actor: string;
  at: string;
};

export type OrderDto = {
  id: string;
  trackingNumber: string;
  status: OrderStatus;
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
  adjustment?: { from: number; to: number; reason?: string; at: string };
  rider?: { id: string; name: string; phone: string; code: string } | null;
  tagCode?: string;
  proof?: { method: DeliveryProofMethod; photoUrl?: string; receivedBy?: string; at: string };
  events: OrderEventDto[];
  createdAt: string;
};

/** What anyone with a tracking number may see — no phone numbers, no addresses. */
export type PublicTrackingDto = {
  trackingNumber: string;
  status: OrderStatus;
  pickupArea: string;
  dropoffArea: string;
  serviceLevel: ServiceLevel;
  riderFirstName?: string;
  events: { status: OrderStatus; at: string }[];
  createdAt: string;
};
