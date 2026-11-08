import { z } from 'zod';

const parsed = z
  .object({ VITE_API_BASE_URL: z.url() })
  .safeParse({ VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL });

if (!parsed.success) throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);

export const env = parsed.data;
