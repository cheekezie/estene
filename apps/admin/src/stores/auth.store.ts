import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AdminProfile } from '@estene/contracts/auth';
import { queryClient } from '@/lib/query-client';

type AuthState = {
  accessToken: string | null;
  user: AdminProfile | null;
  setSession: (s: { accessToken: string; user: AdminProfile }) => void;
  setAccessToken: (token: string) => void;
  clear: () => void;
};

/**
 * The access token is short-lived (15 min); the long-lived refresh token sits
 * in an httpOnly cookie the browser JS can't read.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setSession: ({ accessToken, user }) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => {
        queryClient.clear(); // never show one account's cached data to the next
        set({ accessToken: null, user: null });
      },
    }),
    { name: 'estene-admin-auth' },
  ),
);

export const getAccessToken = () => useAuthStore.getState().accessToken;
