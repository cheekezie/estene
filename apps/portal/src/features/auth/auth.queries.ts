import { useMutation } from '@tanstack/react-query';
import type {
  ClientLoginInput,
  ClientUserProfile,
  PortalChangePasswordInput,
} from '@estene/contracts/portal';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

export const useLogin = () => {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (body: ClientLoginInput) =>
      api.post<{ accessToken: string; user: ClientUserProfile }>('/auth/client/login', body),
    onSuccess: setSession,
  });
};

export const useChangePassword = () => {
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: (body: PortalChangePasswordInput) =>
      api.post<ClientUserProfile>('/portal/me/password', body),
    onSuccess: setUser,
  });
};
