import { env } from '../../../config/env';

/**
 * Expo push service — one HTTP call reaches both iOS (APNs) and Android (FCM).
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android notification channel the app created ("offers" rings loudly). */
  channelId?: string;
  /** Seconds the push service keeps trying; an offer is worthless after it expires. */
  ttl?: number;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
};

type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

/** Sends up to 100 messages; returns the tokens Expo says are no longer valid. */
export async function sendPush(messages: PushMessage[]) {
  if (!messages.length) return { deadTokens: [] as string[] };
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Expo push ${res.status}: ${await res.text()}`);
  const { data } = (await res.json()) as { data: Ticket[] };
  const deadTokens = messages
    .filter((_, i) => data[i]?.details?.error === 'DeviceNotRegistered')
    .map((m) => m.to);
  const failed = data.filter(
    (t) => t.status === 'error' && t.details?.error !== 'DeviceNotRegistered',
  );
  if (failed.length && failed.length === data.length)
    throw new Error(`Expo push failed: ${failed[0]?.message ?? 'unknown error'}`);
  return { deadTokens };
}
