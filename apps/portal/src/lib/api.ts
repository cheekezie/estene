import { createApiClient } from '@estene/api-client/client';
import { env } from './env';
import { getAccessToken, useAuthStore } from '@/stores/auth.store';

/** The portal refreshes through its own cookie, so it never disturbs a staff session in the same browser. */
export const api = createApiClient({
  baseURL: env.VITE_API_BASE_URL,
  refreshPath: '/auth/client/refresh',
  getAccessToken,
  onTokenRefreshed: (token) => useAuthStore.getState().setAccessToken(token),
  onAuthFailure: () => useAuthStore.getState().clear(),
});
