import { z } from 'zod';
import { GeoPointSchema } from './common';

export const ZoneInputSchema = z.object({
  name: z.string().trim().min(2),
  /** Short code printed on labels and used in tracking numbers, e.g. "WSE". */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,4}$/, 'Use 2–4 letters'),
  city: z.string().trim().default('Abuja'),
  /** Districts/neighbourhoods the zone covers — what customers pick from. */
  areas: z.array(z.string().trim().min(2)).min(1, 'Add at least one area'),
  center: GeoPointSchema,
  radiusKm: z.number().positive().max(50),
  /** Fare for pickup and drop-off inside this same zone (kobo). */
  intraZoneFare: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
});
export type ZoneInput = z.infer<typeof ZoneInputSchema>;

export type ZoneDto = ZoneInput & { id: string; createdAt: string };
