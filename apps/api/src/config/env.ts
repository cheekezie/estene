import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/estene'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5400,http://localhost:3100,http://localhost:5500')
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
  /** One gateway for money in (customer payments) and money out (rider payouts). `simulator` for local work. */
  PAYMENTS_PROVIDER: z.enum(['simulator', 'saukipay', 'sayswitch']).default('simulator'),

  SAUKIPAY_BASE_URL: z.url().default('https://server.saukipay.net/api/v1'),
  /** Bearer key for API calls; SaukiPay also sends it back in the webhook `ApiKey` header. */
  SAUKIPAY_SECRET_KEY: z.string().trim().optional(),
  SAUKIPAY_PUBLIC_KEY: z.string().trim().optional(),
  /** How SaukiPay reads `amount`: naira. */
  SAUKIPAY_AMOUNT_UNIT: z.enum(['naira', 'kobo']).default('naira'),

  SAYSWITCH_BASE_URL: z.url().default('https://backendapi.sayswitchgroup.com'),
  /** sk_test_… or sk_live_… — authenticates API calls and signs webhooks. */
  SAYSWITCH_SECRET_KEY: z.string().trim().optional(),
  /** pk_test_… or pk_live_… — not used server-side today; kept with the secret for completeness. */
  SAYSWITCH_PUBLIC_KEY: z.string().trim().optional(),
  /** How SaySwitch reads `amount`. The docs disagree; confirm with a sandbox payment. */
  SAYSWITCH_AMOUNT_UNIT: z.enum(['naira', 'kobo']).default('naira'),
  // ── File storage (delivery photos) ─────────────────────────────────────
  /** `local` keeps files on this machine (development only); `s3` = Cloudflare R2 (or any S3-compatible bucket). */
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  /** R2: https://<account-id>.r2.cloudflarestorage.com */
  S3_ENDPOINT: z.url().optional(),
  /** R2 uses `auto`. */
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public base URL files are read from: the bucket's custom domain (e.g. https://files.estene.ng) or r2.dev URL. */
  S3_PUBLIC_URL: z.url().optional(),

  // ── Push notifications (rider app) ──────────────────────────────────────
  /** Optional: only needed if "enhanced push security" is turned on in the Expo dashboard. */
  EXPO_ACCESS_TOKEN: z.string().optional(),

  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default('Estene'),
});

const parsed = envSchema
  .superRefine((e, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (e.NODE_ENV === 'production') {
      if (e.STORAGE_PROVIDER === 'local')
        issue('STORAGE_PROVIDER', 'Local file storage cannot run in production — use s3');
      if (e.PAYMENTS_PROVIDER === 'simulator')
        issue('PAYMENTS_PROVIDER', 'The payment simulator cannot run in production');
      if (e.PAYMENTS_PROVIDER === 'sayswitch' && e.SAYSWITCH_SECRET_KEY?.startsWith('sk_test_'))
        issue('SAYSWITCH_SECRET_KEY', 'Production needs a live SaySwitch key (sk_live_…)');
    }
    if (e.STORAGE_PROVIDER === 's3')
      for (const key of [
        'S3_ENDPOINT',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
        'S3_PUBLIC_URL',
      ] as const)
        if (!e[key]) issue(key, `Set ${key} to store files in S3`);
    if (e.PAYMENTS_PROVIDER === 'saukipay' && !e.SAUKIPAY_SECRET_KEY)
      issue('SAUKIPAY_SECRET_KEY', 'Set SAUKIPAY_SECRET_KEY to use SaukiPay');
    if (e.PAYMENTS_PROVIDER === 'sayswitch' && !e.SAYSWITCH_SECRET_KEY?.startsWith('sk_'))
      issue(
        'SAYSWITCH_SECRET_KEY',
        'Set SAYSWITCH_SECRET_KEY (sk_test_… or sk_live_…) to use SaySwitch',
      );
  })
  .safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
