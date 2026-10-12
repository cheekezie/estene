import { createApiClient } from '@estene/api-client/client';
import { env } from './env';
import { getAccessToken, useAuthStore } from '@/stores/auth.store';

export const api = createApiClient({
  baseURL: env.VITE_API_BASE_URL,
  getAccessToken,
  onTokenRefreshed: (token) => useAuthStore.getState().setAccessToken(token),
  onAuthFailure: () => useAuthStore.getState().clear(),
});
