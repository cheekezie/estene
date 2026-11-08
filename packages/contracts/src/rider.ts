import { z } from 'zod';
import {
  RIDER_STATUSES,
  RIDER_TYPES,
  VEHICLE_TYPES,
  type RiderStatus,
  type RiderType,
  type VehicleType,
} from './enums';
import {
  GeoPointSchema,
  NigerianPhoneSchema,
  ObjectIdSchema,
  PaginationQuerySchema,
} from './common';

const RiderBaseSchema = z.object({
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().min(2),
  phone: NigerianPhoneSchema,
  email: z.email().trim().toLowerCase().optional(),
  type: z.enum(RIDER_TYPES),
  vehicleType: z.enum(VEHICLE_TYPES),
  plateNumber: z.string().trim().toUpperCase().optional(),
  /** Riders in their primary zone get first priority for jobs there. */
  primaryZoneId: ObjectIdSchema,
  coverageZoneIds: z.array(ObjectIdSchema).default([]),
  /** Partner riders only: our cut of each trip, percent. Falls back to the platform default. */
  commissionPct: z.number().min(0).max(100).optional(),
  /** Partner riders only: the fleet/company they ride for, if any. */
  fleetName: z.string().trim().optional(),
});

export const RiderInputSchema = RiderBaseSchema.refine(
  (r) => r.type === 'partner' || r.commissionPct === undefined,
  { path: ['commissionPct'], message: 'Commission only applies to partner riders' },
);
export type RiderInput = z.infer<typeof RiderInputSchema>;

/** Phone is the login identity — changing it goes through a separate, verified flow. */
export const RiderUpdateSchema = RiderBaseSchema.omit({ phone: true }).partial();
export type RiderUpdateInput = z.infer<typeof RiderUpdateSchema>;

export const RiderStatusUpdateSchema = z.object({ status: z.enum(RIDER_STATUSES) });

export const RiderListQuerySchema = PaginationQuerySchema.extend({
  type: z.enum(RIDER_TYPES).optional(),
  status: z.enum(RIDER_STATUSES).optional(),
  zoneId: ObjectIdSchema.optional(),
});

/** Sent by the rider app every ~15s while online. */
export const RiderHeartbeatSchema = GeoPointSchema.extend({
  heading: z.number().min(0).max(360).optional(),
  speedKph: z.number().min(0).optional(),
});

export type RiderDto = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  type: RiderType;
  status: RiderStatus;
  vehicleType: VehicleType;
  plateNumber?: string;
  primaryZone: { id: string; name: string; code: string } | null;
  coverageZoneIds: string[];
  commissionPct?: number;
  fleetName?: string;
  isOnline: boolean;
  activeJobs: number;
  createdAt: string;
};

// ── Rider app ───────────────────────────────────────────────────────────────

/** The app registers its Expo push token so job offers reach a locked phone. */
export const RiderPushTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^Expo(nent)?PushToken\[.+\]$/, 'Not an Expo push token'),
  platform: z.enum(['ios', 'android']),
});
export type RiderPushTokenInput = z.infer<typeof RiderPushTokenSchema>;

/** Data sent with an offer push, so tapping it opens the offer. */
export type RiderPushData = { type: 'offer'; offerId: string; shipmentId: string };
