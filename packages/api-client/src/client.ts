import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiFailure, ApiSuccess } from '@estene/contracts/common';
import { ApiError } from '@estene/lib/errors';

export { ApiError };

export interface ApiClientOptions {
  baseURL: string;
  /** Omit for a public client — no auth header and no refresh flow. */
  getAccessToken?: () => string | null | undefined;
  onTokenRefreshed?: (token: string) => void;
  onAuthFailure?: () => void;
  timeout?: number;
  /** Where the 401 flow refreshes the access token. The client portal uses its own path and cookie. */
  refreshPath?: string;
}

type RetryConfig = AxiosRequestConfig & { _retry?: boolean };

/**
 * Axios wrapped around the API's envelope: resolves with `data` on success,
 * rejects with a typed `ApiError` otherwise. On a 401 it refreshes the access
 * token once (the refresh cookie is httpOnly) and replays the request;
 * concurrent 401s share a single refresh.
 */
export function createApiClient(opts: ApiClientOptions) {
  const http = axios.create({
    baseURL: opts.baseURL,
    withCredentials: true,
    timeout: opts.timeout ?? 20_000,
  });

  http.interceptors.request.use((config) => {
    const token = opts.getAccessToken?.();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  let refreshing: Promise<string | null> | null = null;

  http.interceptors.response.use(undefined, async (error: AxiosError<ApiFailure>) => {
    const original = error.config as RetryConfig | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthCall &&
      opts.getAccessToken
    ) {
      original._retry = true;
      refreshing ??= http
        .post<ApiSuccess<{ accessToken: string }>>(opts.refreshPath ?? '/auth/refresh')
        .then(({ data }) => {
          opts.onTokenRefreshed?.(data.data.accessToken);
          return data.data.accessToken;
        })
        .catch(() => {
          opts.onAuthFailure?.();
          return null;
        })
        .finally(() => {
          refreshing = null;
        });

      if (await refreshing) return http(original);
    }

    const body = error.response?.data;
    const status = error.response?.status ?? 0;
    return Promise.reject(
      new ApiError(
        status,
        body?.code ?? (status === 0 ? 'NETWORK' : `HTTP_${status}`),
        body?.message ?? (status === 0 ? 'Network error — check your connection' : error.message),
        body?.errors,
      ),
    );
  });

  const unwrap = <T>(p: Promise<{ data: ApiSuccess<T> }>) => p.then((r) => r.data.data);

  return {
    get: <T>(url: string, params?: object) => unwrap<T>(http.get(url, { params })),
    post: <T>(url: string, body?: unknown) => unwrap<T>(http.post(url, body)),
    put: <T>(url: string, body?: unknown) => unwrap<T>(http.put(url, body)),
    patch: <T>(url: string, body?: unknown) => unwrap<T>(http.patch(url, body)),
    delete: <T>(url: string) => unwrap<T>(http.delete(url)),
    /** Sends a file as the raw request body (no multipart), typed by the file's own type. */
    upload: <T>(url: string, file: Blob, params?: object) =>
      unwrap<T>(
        http.post(url, file, {
          params,
          headers: { 'Content-Type': file.type },
          timeout: 120_000,
        }),
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
