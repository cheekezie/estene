import { z } from 'zod';
import { GeoPointSchema, NigerianPhoneSchema, ObjectIdSchema } from './common';

/** An Estene branch: where senders drop off, parcels are consolidated, and recipients collect. */
export const OfficeInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  /** Printed on manifests, e.g. "ABJ-WSE". */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}-[A-Z]{2,4}$/, 'Use STATE-AREA, e.g. ABJ-WSE'),
  zoneId: ObjectIdSchema,
  area: z.string().trim().min(2),
  address: z.string().trim().min(5).max(200),
  landmark: z.string().trim().max(120).optional(),
  phone: NigerianPhoneSchema,
  openingHours: z.string().trim().max(120).default('Mon–Sat, 8am–6pm'),
  location: GeoPointSchema.optional(),
  isActive: z.boolean().default(true),
  /** Holds business clients' stock for warehousing orders. */
  isWarehouse: z.boolean().default(false),
});
export type OfficeInput = z.infer<typeof OfficeInputSchema>;

export type OfficeDto = Omit<OfficeInput, 'zoneId'> & {
  id: string;
  zone: { id: string; name: string; code: string; city: string; state: string };
  createdAt: string;
};

/** What the public site shows when a customer picks an office. */
export type PublicOfficeDto = Pick<
  OfficeDto,
  'id' | 'name' | 'code' | 'area' | 'address' | 'landmark' | 'phone' | 'openingHours'
> & {
  zoneId: string;
  city: string;
  state: string;
};
