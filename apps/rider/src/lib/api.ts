import type { ApiFailure, ApiSuccess } from '@estene/contracts/common';
import { API_URL } from './config';
import { session } from './session';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
  }
}

type Listener = () => void;
const signedOutListeners = new Set<Listener>();
/** Called when the session can't be refreshed any more — the app returns to the login screen. */
export const onSignedOut = (fn: Listener) => {
  signedOutListeners.add(fn);
  return () => {
    signedOutListeners.delete(fn);
  };
};

async function raw<T>(method: string, path: string, body: unknown, token: string | null) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 0, 'NETWORK');
  }
  const json = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (!res.ok || !json || json.success === false) {
    const fail = json as ApiFailure | null;
    throw new ApiError(
      fail?.message ?? `Something went wrong (${res.status})`,
      res.status,
      fail?.code,
      fail?.errors,
    );
  }
  return json.data;
}

/**
 * Refresh tokens rotate, and reusing an old one signs every device out, so
 * only one refresh may be in flight at a time.
 */
let refreshing: Promise<string | null> | null = null;
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const refreshToken = await session.refreshToken();
      if (!refreshToken) return null;
      const tokens = await raw<{ accessToken: string; refreshToken: string }>(
        'POST',
        '/api/auth/refresh',
        { refreshToken },
        null,
      );
      await session.save(tokens);
      return tokens.accessToken;
    } catch (err) {
      // Only a definite refusal ends the session; a dropped connection doesn't.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await session.clear();
        signedOutListeners.forEach((fn) => fn());
      }
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await session.accessToken();
  try {
    return await raw<T>(method, path, body, token);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !token) throw err;
    const fresh = await refreshAccessToken();
    if (!fresh) {
      // Refresh failed but the session is still stored: it was the connection, not a sign-out.
      if (await session.refreshToken())
        throw new ApiError('No connection. Check your internet and try again.', 0, 'NETWORK');
      throw new ApiError('Your session has ended. Sign in again.', 401, 'SESSION_ENDED');
    }
    return raw<T>(method, path, body, fresh);
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  /** For sign-in: no token, no refresh. */
  public: <T>(path: string, body: unknown) => raw<T>('POST', path, body, null),
};

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Try again.';
