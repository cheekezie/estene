import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClientDto,
  ClientInput,
  ClientStatsDto,
  WebhookConfigInput,
  WebhookDeliveryDto,
} from '@estene/contracts/client';
import type { Paginated } from '@estene/contracts/common';
import type { ClientStatus } from '@estene/contracts/enums';
import { api } from '@/lib/api';

export type ClientDetail = ClientDto & { stats: ClientStatsDto };
export type ClientOption = { id: string; name: string; phone: string };

export const clientKeys = {
  list: (f: object) => ['clients', 'list', f] as const,
  detail: (id: string) => ['clients', 'detail', id] as const,
  deliveries: (id: string) => ['clients', 'deliveries', id] as const,
  options: ['clients', 'options'] as const,
};

export const useClients = (f: { page: number; search?: string; status?: ClientStatus }) =>
  useQuery({
    queryKey: clientKeys.list(f),
    queryFn: () => api.get<Paginated<ClientDto>>('/clients', { ...f, limit: 20 }),
    placeholderData: keepPreviousData,
  });

export const useClient = (id: string) =>
  useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: () => api.get<ClientDetail>(`/clients/${id}`),
  });

export const useClientOptions = () =>
  useQuery({
    queryKey: clientKeys.options,
    queryFn: () => api.get<ClientOption[]>('/clients/options'),
    staleTime: 5 * 60_000,
  });

export const useWebhookDeliveries = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: clientKeys.deliveries(id),
    queryFn: () => api.get<WebhookDeliveryDto[]>(`/clients/${id}/webhook/deliveries`),
    enabled,
    refetchInterval: 10_000,
  });

/** Every client mutation refreshes the detail view and lists. */
function useClientMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientInput) => api.post<ClientDto>('/clients', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export const useUpdateClient = (id: string) =>
  useClientMutation((input: Partial<ClientInput>) => api.patch<ClientDto>(`/clients/${id}`, input));
export const useSetClientStatus = (id: string) =>
  useClientMutation((status: ClientStatus) =>
    api.post<ClientDto>(`/clients/${id}/status`, { status }),
  );
export const useCreateApiKey = (id: string) =>
  useClientMutation((name: string) =>
    api.post<{ key: string }>(`/clients/${id}/api-keys`, { name }),
  );
export const useRevokeApiKey = (id: string) =>
  useClientMutation((keyId: string) => api.delete<ClientDto>(`/clients/${id}/api-keys/${keyId}`));
export const useSaveWebhook = (id: string) =>
  useClientMutation((input: WebhookConfigInput) =>
    api.put<{ secret: string | null }>(`/clients/${id}/webhook`, input),
  );
export const useRemoveWebhook = (id: string) =>
  useClientMutation(() => api.delete(`/clients/${id}/webhook`));
export const useRotateSecret = (id: string) =>
  useClientMutation(() => api.post<{ secret: string }>(`/clients/${id}/webhook/rotate-secret`));
export const useSendTestEvent = (id: string) =>
  useClientMutation(() => api.post(`/clients/${id}/webhook/test`));
export const useResendDelivery = (id: string) =>
  useClientMutation((deliveryId: string) =>
    api.post(`/clients/${id}/webhook/deliveries/${deliveryId}/resend`),
  );

export const revealSecret = (id: string) =>
  api.get<{ secret: string }>(`/clients/${id}/webhook/secret`);
