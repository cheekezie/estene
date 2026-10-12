import { z } from 'zod';

export const ObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/** Accepts 080..., 23480..., +23480... and normalises to E.164 (+234XXXXXXXXXX). */
export const NigerianPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .refine((v) => /^(\+?234|0)[789][01]\d{8}$/.test(v), 'Enter a valid Nigerian phone number')
  .transform((v) => `+234${v.replace(/^(\+?234|0)/, '')}`);

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

/** Envelope every API response uses. */
export type ApiSuccess<T> = { success: true; statusCode: number; message?: string; data: T };
export type ApiFailure = {
  success: false;
  statusCode: number;
  code?: string;
  message: string;
  errors?: Record<string, string>;
};
