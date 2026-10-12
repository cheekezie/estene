import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/estene'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5400,http://localhost:3100')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  /** Public website — used for tracking links in SMS and integration payloads. */
  PUBLIC_SITE_URL: z.string().default('http://localhost:3100'),
  /** Public API origin — used to build links the browser follows (simulator pages). */
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),

  // ── Payments ────────────────────────────────────────────────────────────
  /**
   * Only the development simulator exists today; the SaySwitch gateway plugs
   * in behind the same PaymentGateway interface (modules/payments/providers).
   */
  PAYMENTS_PROVIDER: z.enum(['simulator']).default('simulator'),
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default('Estene'),
});

const parsed = envSchema
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production' && e.PAYMENTS_PROVIDER === 'simulator') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENTS_PROVIDER'],
        message: 'The payment simulator cannot run in production',
      });
    }
  })
  .safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
