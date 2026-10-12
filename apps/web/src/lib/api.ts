import type { ApiFailure, ApiSuccess } from '@estene/contracts/common';
import type {
  CreateShipmentInput,
  PublicTrackingDto,
  QuoteRequest,
} from '@estene/contracts/shipment';
import type { QuoteLine } from '@estene/contracts/pricing';
import type { CheckoutSession, TransactionDto } from '@estene/contracts/payment';

/** Prepaid bookings come back with either a hosted checkout or an account number to pay into. */
export type PaymentStart = { checkout?: CheckoutSession; transfer?: TransactionDto };

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new PublicApiError('We could not reach Estene. Check your connection and try again.', 0);
  }
  const body = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (!res.ok || !body?.success) {
    const failure = body as ApiFailure | null;
    throw new PublicApiError(
      failure?.message ?? 'Something went wrong',
      res.status,
      failure?.errors,
    );
  }
  return body.data;
}

export type PublicZone = { id: string; name: string; code: string; areas: string[] };

export const publicApi = {
  /** Zones change rarely — cache for 5 minutes on the server. */
  zones: () => request<PublicZone[]>('/public/zones', { next: { revalidate: 300 } }),
  quote: (body: QuoteRequest) =>
    request<{ lines: QuoteLine[]; total: number }>('/public/quote', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  book: (body: CreateShipmentInput) =>
    request<{
      id: string;
      trackingNumber: string;
      status: string;
      estimate: { total: number };
      payment: PaymentStart | null;
    }>('/public/shipments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Pay what's owed on a shipment from the tracking page. */
  pay: (trackingNumber: string, channel: 'checkout' | 'transfer') =>
    request<PaymentStart>(`/public/track/${encodeURIComponent(trackingNumber)}/pay`, {
      method: 'POST',
      body: JSON.stringify({ channel }),
    }),
  /** Re-checks a payment with the gateway after the shopper returns from checkout. */
  verifyPayment: (reference: string) =>
    request<{
      reference: string;
      status: 'pending' | 'success' | 'failed' | 'expired';
      amount?: number;
      trackingNumber?: string;
      shipmentStatus?: string;
    }>(`/public/payments/${encodeURIComponent(reference)}/verify`, {
      method: 'POST',
      cache: 'no-store',
    }),
  track: (tn: string) =>
    request<PublicTrackingDto>(`/public/track/${encodeURIComponent(tn)}`, { cache: 'no-store' }),
};
