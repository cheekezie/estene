import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { RiderLoginInput } from '@estene/contracts/auth';
import { api, onSignedOut } from '../lib/api';
import { goOffline } from '../lib/location';
import { registerForPush, unregisterPush } from '../lib/push';
import { session, type SessionUser } from '../lib/session';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'signedIn'; user: SessionUser };

type AuthContextValue = AuthState & {
  signIn: (input: RiderLoginInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    void (async () => {
      const [user, refresh] = await Promise.all([session.user(), session.refreshToken()]);
      if (user && refresh) {
        setState({ status: 'signedIn', user });
        void registerForPush();
      } else setState({ status: 'signedOut', user: null });
    })();
    return onSignedOut(() => {
      queryClient.clear();
      setState({ status: 'signedOut', user: null });
    });
  }, [queryClient]);

  const signIn = useCallback(async (input: RiderLoginInput) => {
    const res = await api.public<{
      accessToken: string;
      refreshToken: string;
      user: SessionUser;
    }>('/api/auth/rider/login', input);
    await session.save(res, res.user);
    setState({ status: 'signedIn', user: res.user });
    void registerForPush();
  }, []);

  const signOut = useCallback(async () => {
    await goOffline().catch(() => undefined);
    await unregisterPush();
    const refreshToken = await session.refreshToken();
    if (refreshToken) await api.public('/api/auth/logout', { refreshToken }).catch(() => undefined);
    await session.clear();
    queryClient.clear();
    setState({ status: 'signedOut', user: null });
  }, [queryClient]);

  const value = useMemo(() => ({ ...state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
