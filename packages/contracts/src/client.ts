import { z } from 'zod';
import { CLIENT_STATUSES, WEBHOOK_EVENTS, type ClientStatus, type WebhookEvent } from './enums';
import { NigerianPhoneSchema, ObjectIdSchema, PaginationQuerySchema } from './common';

export const CLIENT_INDUSTRIES = [
  'ecommerce',
  'retail',
  'fashion',
  'food',
  'pharmacy',
  'healthcare',
  'electronics',
  'documents',
  'logistics',
  'government',
  'other',
] as const;
export type ClientIndustry = (typeof CLIENT_INDUSTRIES)[number];

export const CLIENT_INDUSTRY_LABELS: Record<ClientIndustry, string> = {
  ecommerce: 'E-commerce / online store',
  retail: 'Retail & supermarkets',
  fashion: 'Fashion & beauty',
  food: 'Food & restaurants',
  pharmacy: 'Pharmacy',
  healthcare: 'Hospitals & labs',
  electronics: 'Phones & electronics',
  documents: 'Legal, banking & documents',
  logistics: 'Logistics & fulfilment',
  government: 'Government & NGOs',
  other: 'Other',
};

/** Expected shipments per month — sizes rider capacity and account attention. */
export const MONTHLY_VOLUMES = ['1-50', '51-200', '201-1000', '1000+'] as const;
export type MonthlyVolume = (typeof MONTHLY_VOLUMES)[number];

/** Days after month-end an on-account invoice is due. 0 = pay per shipment. */
export const PAYMENT_TERMS_DAYS = [0, 7, 14, 30] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const ClientContactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  role: optionalText(60),
  phone: NigerianPhoneSchema,
  email: z.email().trim().toLowerCase(),
});

/** Business address — also the default pickup when staff book for this client. */
export const ClientAddressSchema = z.object({
  line: z.string().trim().min(5).max(200),
  zoneId: ObjectIdSchema.optional(),
  area: optionalText(80),
  landmark: optionalText(120),
  city: z.string().trim().min(2).max(60).default('Abuja'),
  state: z.string().trim().min(2).max(60).default('FCT'),
});

/** A business that sends us parcels — by phone, through ops, or via the integration API. */
export const ClientInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: optionalText(160),
  industry: z.enum(CLIENT_INDUSTRIES),
  /** CAC registration number, e.g. RC 1234567 / BN 1234567. */
  rcNumber: optionalText(20),
  website: z.url().max(200).optional(),
  contact: ClientContactSchema,
  address: ClientAddressSchema,
  billing: z
    .object({
      email: z.email().trim().toLowerCase().optional(),
      paymentTermsDays: z.union(PAYMENT_TERMS_DAYS.map((d) => z.literal(d))).default(0),
      /** Max unpaid on-account balance in kobo; omitted = no limit. */
      creditLimit: z.number().int().positive().optional(),
    })
    .default({ paymentTermsDays: 0 }),
  expectedMonthlyVolume: z.enum(MONTHLY_VOLUMES).optional(),
  accountManagerId: ObjectIdSchema.optional(),
  notes: optionalText(1000),
});
export type ClientInput = z.infer<typeof ClientInputSchema>;
export type ClientFormInput = z.input<typeof ClientInputSchema>;

export const ClientListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(CLIENT_STATUSES).optional(),
  industry: z.enum(CLIENT_INDUSTRIES).optional(),
});

export const ApiKeyCreateSchema = z.object({ name: z.string().trim().min(2).max(60) });

export const WebhookConfigSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Pick at least one event'),
  isActive: z.boolean().default(true),
});
export type WebhookConfigInput = z.infer<typeof WebhookConfigSchema>;

export type ApiKeyDto = {
  id: string;
  name: string;
  /** e.g. "est_live_4f9a…" — enough to recognise, useless to an attacker. */
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ClientDto = {
  id: string;
  name: string;
  legalName?: string;
  industry: ClientIndustry;
  rcNumber?: string;
  website?: string;
  contact: z.infer<typeof ClientContactSchema>;
  address: z.output<typeof ClientAddressSchema> & {
    zone: { id: string; name: string; code: string } | null;
  };
  billing: { email?: string; paymentTermsDays: number; creditLimit?: number };
  expectedMonthlyVolume?: MonthlyVolume;
  accountManager: { id: string; name: string } | null;
  notes?: string;
  status: ClientStatus;
  apiKeys: ApiKeyDto[];
  webhook: { url: string; events: WebhookEvent[]; isActive: boolean; hasSecret: boolean } | null;
  createdAt: string;
};

export type ClientStatsDto = {
  shipments: number;
  activeShipments: number;
  /** Delivered on-account charges not yet paid, kobo. */
  outstanding: number;
};

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'delivered', 'failed'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export const WebhookDeliveryQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(WEBHOOK_DELIVERY_STATUSES).optional(),
  type: z.string().max(60).optional(),
});

export type WebhookDeliveryDto = {
  id: string;
  eventId: string;
  type: WebhookEvent | 'ping';
  title: string;
  summary: string;
  trackingNumber: string | null;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  lastDurationMs: number | null;
  lastAttemptAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

/** Everything needed to debug one delivery: where it went, what we sent, what came back. */
export type WebhookDeliveryDetailDto = WebhookDeliveryDto & {
  url: string;
  payload: unknown;
  lastResponseBody: string | null;
};

/** Envelope POSTed to a client's webhook URL. */
export type WebhookEnvelope<T> = {
  id: string;
  type: WebhookEvent | 'ping';
  /** Human-readable event name, e.g. "Out for delivery". */
  title: string;
  /** One sentence describing what happened — safe to forward to your own customers or team chat. */
  summary: string;
  createdAt: string;
  data: T;
};
