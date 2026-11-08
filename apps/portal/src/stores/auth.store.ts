import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClientUserProfile } from '@estene/contracts/portal';
import { queryClient } from '@/lib/query-client';

type AuthState = {
  accessToken: string | null;
  user: ClientUserProfile | null;
  setSession: (s: { accessToken: string; user: ClientUserProfile }) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: ClientUserProfile) => void;
  clear: () => void;
};

/** Short-lived access token here; the refresh token lives in an httpOnly cookie. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setSession: ({ accessToken, user }) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      clear: () => {
        queryClient.clear();
        set({ accessToken: null, user: null });
      },
    }),
    { name: 'estene-portal-auth' },
  ),
);

export const getAccessToken = () => useAuthStore.getState().accessToken;
