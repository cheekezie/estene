import { z } from 'zod';
import { VEHICLE_TYPES, type RiderType, type VehicleType } from './enums';
import { NigerianPhoneSchema, ObjectIdSchema, PaginationQuerySchema } from './common';
import { RiderInputSchema } from './rider';

/**
 * Someone applies on the website, ops calls them in for vetting at an office,
 * uploads the documents they bring, then approves (creates the rider) or rejects.
 */
export const RIDER_APPLICATION_STATUSES = ['submitted', 'vetting', 'approved', 'rejected'] as const;
export type RiderApplicationStatus = (typeof RIDER_APPLICATION_STATUSES)[number];

/** Individual rider, or someone who owns bikes and puts riders on them. */
export const APPLICANT_KINDS = ['rider', 'fleet_owner'] as const;
export type ApplicantKind = (typeof APPLICANT_KINDS)[number];

export const RIDER_DOCUMENT_TYPES = [
  'government_id',
  'drivers_licence',
  'passport_photo',
  'guarantor_form',
  'vehicle_papers',
  'other',
] as const;
export type RiderDocumentType = (typeof RIDER_DOCUMENT_TYPES)[number];

export const RIDER_DOCUMENT_META: Record<RiderDocumentType, { label: string; required: boolean }> =
  {
    government_id: { label: 'Government ID (NIN slip, voter’s card, passport)', required: true },
    drivers_licence: { label: 'Driver’s or rider’s licence', required: true },
    passport_photo: { label: 'Passport photograph', required: true },
    guarantor_form: { label: 'Guarantor form', required: false },
    vehicle_papers: { label: 'Vehicle papers', required: false },
    other: { label: 'Other', required: false },
  };

/** Documents must be on file before an application can be approved. */
export const REQUIRED_RIDER_DOCUMENTS = RIDER_DOCUMENT_TYPES.filter(
  (t) => RIDER_DOCUMENT_META[t].required,
);

export const RIDER_DOCUMENT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const MAX_RIDER_DOCUMENT_BYTES = 10 * 1024 * 1024;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

/** The public form on the website. */
export const RiderApplicationInputSchema = z
  .object({
    kind: z.enum(APPLICANT_KINDS).default('rider'),
    firstName: z
      .string({ error: 'Enter your first name' })
      .trim()
      .min(2, 'Enter your first name')
      .max(60),
    lastName: z
      .string({ error: 'Enter your last name' })
      .trim()
      .min(2, 'Enter your last name')
      .max(60),
    phone: NigerianPhoneSchema,
    email: z
      .union([z.email('Enter a valid email').trim().toLowerCase(), z.literal('')])
      .optional()
      .transform((v) => v || undefined),
    /** The applicant's address area — where they'd start from. */
    area: z
      .string({ error: 'Tell us where you live' })
      .trim()
      .min(2, 'Tell us where you live')
      .max(80),
    preferredZoneId: ObjectIdSchema.optional(),
    vehicleType: z.enum(VEHICLE_TYPES, { error: 'Choose a vehicle' }),
    ownsVehicle: z.boolean({ error: 'Do you own the vehicle?' }),
    plateNumber: optionalText(20).transform((v) => v?.toUpperCase()),
    yearsRiding: z.coerce
      .number({ error: 'How many years have you been riding?' })
      .int()
      .min(0, 'How many years have you been riding?')
      .max(60),
    /** Fleet owners: business name and how many vehicles. */
    fleetName: optionalText(80),
    fleetSize: z.coerce.number().int().min(1).max(1000).optional(),
    notes: optionalText(500),
    consent: z.literal(true, 'Please agree so we can contact you'),
  })
  .refine((a) => a.kind === 'rider' || a.fleetSize !== undefined, {
    path: ['fleetSize'],
    message: 'How many vehicles do you have?',
  });
export type RiderApplicationInput = z.input<typeof RiderApplicationInputSchema>;
export type RiderApplicationData = z.output<typeof RiderApplicationInputSchema>;

export const RiderApplicationListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(RIDER_APPLICATION_STATUSES).optional(),
});

/** Ops invites the applicant in: when and where, plus a note. */
export const RiderApplicationVettingSchema = z.object({
  vettingAt: z.coerce.date().optional(),
  officeId: ObjectIdSchema.optional(),
  note: optionalText(1000),
});
export type RiderApplicationVettingInput = z.infer<typeof RiderApplicationVettingSchema>;

export const RiderApplicationNoteSchema = z.object({ note: z.string().trim().min(1).max(1000) });

export const RiderApplicationRejectSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason').max(500),
});

/** Approval creates the rider; the details are pre-filled from the application. */
export const RiderApplicationApproveSchema = RiderInputSchema;

export const RiderDocumentUploadQuerySchema = z.object({
  type: z.enum(RIDER_DOCUMENT_TYPES),
  fileName: z.string().trim().min(1).max(120),
});

export type RiderDocumentDto = {
  id: string;
  type: RiderDocumentType;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy: string | null;
  uploadedAt: string;
};

export type RiderApplicationDto = {
  id: string;
  reference: string;
  status: RiderApplicationStatus;
  kind: ApplicantKind;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  area: string;
  preferredZone: { id: string; name: string } | null;
  vehicleType: VehicleType;
  ownsVehicle: boolean;
  plateNumber?: string;
  yearsRiding: number;
  fleetName?: string;
  fleetSize?: number;
  notes?: string;
  vetting: { at?: string; office: { id: string; name: string } | null } | null;
  documents: RiderDocumentDto[];
  missingDocuments: RiderDocumentType[];
  timeline: { at: string; by: string | null; text: string }[];
  rejectionReason?: string;
  rider: { id: string; code: string; type: RiderType } | null;
  createdAt: string;
};

export type RiderApplicationSummaryDto = Pick<
  RiderApplicationDto,
  | 'id'
  | 'reference'
  | 'status'
  | 'kind'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'area'
  | 'vehicleType'
  | 'preferredZone'
  | 'createdAt'
> & { documentCount: number };
