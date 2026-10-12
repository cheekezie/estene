import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClientDto,
  ClientIndustry,
  ClientInput,
  ClientStatsDto,
  WebhookConfigInput,
  WebhookDeliveryDetailDto,
  WebhookDeliveryDto,
  WebhookDeliveryStatus,
} from '@estene/contracts/client';
import type { Paginated } from '@estene/contracts/common';
import type { ClientStatus } from '@estene/contracts/enums';
import { api } from '@/lib/api';

export type ClientDetail = ClientDto & { stats: ClientStatsDto };
export type ClientOption = {
  id: string;
  name: string;
  /** Business address/contact — pre-fills pickup when staff book for this client. */
  pickup: {
    contactName: string;
    phone: string;
    address: string;
    zoneId?: string;
    area?: string;
    landmark?: string;
  };
};
export type DeliveryFilters = {
  page: number;
  status?: WebhookDeliveryStatus;
  type?: string;
  search?: string;
};

export const clientKeys = {
  all: ['clients'] as const,
  list: (f: object) => ['clients', 'list', f] as const,
  detail: (id: string) => ['clients', 'detail', id] as const,
  options: ['clients', 'options'] as const,
  managers: ['clients', 'managers'] as const,
  deliveries: (id: string, f?: DeliveryFilters) => ['clients', 'deliveries', id, f] as const,
  delivery: (id: string, deliveryId: string) => ['clients', 'delivery', id, deliveryId] as const,
  webhookStats: (id: string) => ['clients', 'webhook-stats', id] as const,
};

export const useClients = (f: {
  page: number;
  search?: string;
  status?: ClientStatus;
  industry?: ClientIndustry;
}) =>
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

export const useAccountManagers = () =>
  useQuery({
    queryKey: clientKeys.managers,
    queryFn: () =>
      api.get<{ id: string; name: string; role: string }[]>('/clients/account-managers'),
    staleTime: 10 * 60_000,
  });

export const useWebhookDeliveries = (id: string, f: DeliveryFilters) =>
  useQuery({
    queryKey: clientKeys.deliveries(id, f),
    queryFn: () =>
      api.get<Paginated<WebhookDeliveryDto>>(`/clients/${id}/webhook/deliveries`, {
        ...f,
        limit: 25,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

export const useWebhookDelivery = (id: string, deliveryId: string | null) =>
  useQuery({
    queryKey: clientKeys.delivery(id, deliveryId ?? ''),
    queryFn: () =>
      api.get<WebhookDeliveryDetailDto>(`/clients/${id}/webhook/deliveries/${deliveryId}`),
    enabled: !!deliveryId,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 3_000 : false),
  });

export const useWebhookStats = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: clientKeys.webhookStats(id),
    queryFn: () =>
      api.get<{ delivered: number; failed: number; pending: number }>(
        `/clients/${id}/webhook/stats`,
      ),
    enabled,
    refetchInterval: 15_000,
  });

/** Every client mutation refreshes all client views (detail, lists, logs). */
function useClientMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

export const useCreateClient = () =>
  useClientMutation((input: ClientInput) => api.post<ClientDto>('/clients', input));
export const useUpdateClient = (id: string) =>
  useClientMutation((input: ClientInput) => api.patch<ClientDto>(`/clients/${id}`, input));
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
