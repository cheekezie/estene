import { z } from 'zod';
import { CLIENT_STATUSES, WEBHOOK_EVENTS, type ClientStatus, type WebhookEvent } from './enums';
import { NigerianPhoneSchema, PaginationQuerySchema } from './common';

/** A business that sends us parcels — by phone, through ops, or via the integration API. */
export const ClientInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(80),
  email: z.email().trim().toLowerCase(),
  phone: NigerianPhoneSchema,
  notes: z.string().trim().max(500).optional(),
});
export type ClientInput = z.infer<typeof ClientInputSchema>;

export const ClientListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(CLIENT_STATUSES).optional(),
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
  contactName: string;
  email: string;
  phone: string;
  notes?: string;
  status: ClientStatus;
  apiKeys: ApiKeyDto[];
  webhook: { url: string; events: WebhookEvent[]; isActive: boolean; hasSecret: boolean } | null;
  createdAt: string;
};

export type ClientStatsDto = {
  orders: number;
  activeOrders: number;
  /** Delivered on-account charges not yet paid, kobo. */
  outstanding: number;
};

export type WebhookDeliveryDto = {
  id: string;
  eventId: string;
  type: WebhookEvent | 'ping';
  trackingNumber: string | null;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

/** Envelope POSTed to a client's webhook URL. */
export type WebhookEnvelope<T> = {
  id: string;
  type: WebhookEvent | 'ping';
  createdAt: string;
  data: T;
};
