import { z } from 'zod';
import {
  CARRIER_TYPES,
  MANIFEST_STATUSES,
  type CarrierType,
  type ManifestStatus,
  type ShipmentStatus,
} from './enums';
import { ObjectIdSchema, PaginationQuerySchema } from './common';

export const CreateManifestSchema = z
  .object({
    fromOfficeId: ObjectIdSchema,
    toOfficeId: ObjectIdSchema,
    carrierType: z.enum(CARRIER_TYPES),
    /** own_vehicle */
    vehiclePlate: z.string().trim().toUpperCase().max(20).optional(),
    driverName: z.string().trim().max(80).optional(),
    driverPhone: z.string().trim().max(20).optional(),
    /** partner */
    carrierName: z.string().trim().max(80).optional(),
    waybillNumber: z.string().trim().max(60).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((m) => m.fromOfficeId !== m.toOfficeId, {
    path: ['toOfficeId'],
    message: 'Pick a different destination office',
  })
  .refine((m) => m.carrierType !== 'partner' || !!m.carrierName, {
    path: ['carrierName'],
    message: 'Name the transport company',
  });
export type CreateManifestInput = z.infer<typeof CreateManifestSchema>;

/** Carrier details can be completed right up to departure (e.g. waybill issued at the bus park). */
export const UpdateManifestCarrierSchema = z.object({
  vehiclePlate: z.string().trim().toUpperCase().max(20).optional(),
  driverName: z.string().trim().max(80).optional(),
  driverPhone: z.string().trim().max(20).optional(),
  carrierName: z.string().trim().max(80).optional(),
  waybillNumber: z.string().trim().max(60).optional(),
  note: z.string().trim().max(300).optional(),
});

export const ManifestListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(MANIFEST_STATUSES).optional(),
  officeId: ObjectIdSchema.optional(),
});

/** Scan input: a QR tag code or a tracking number. */
export const ScanSchema = z.object({ code: z.string().trim().min(6).max(30) });

export type ManifestDto = {
  id: string;
  code: string;
  status: ManifestStatus;
  from: { id: string; name: string; code: string; city: string };
  to: { id: string; name: string; code: string; city: string };
  carrier: {
    type: CarrierType;
    vehiclePlate?: string;
    driverName?: string;
    driverPhone?: string;
    carrierName?: string;
    waybillNumber?: string;
  };
  note?: string;
  shipments: {
    id: string;
    trackingNumber: string;
    tagCode?: string;
    status: ShipmentStatus;
    received: boolean;
    destinationArea: string;
  }[];
  counts: { total: number; received: number };
  createdBy: { id: string; name: string } | null;
  departedAt: string | null;
  arrivedAt: string | null;
  closedAt: string | null;
  createdAt: string;
};
