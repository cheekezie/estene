import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type {
  BankAccountDto,
  BankAccountInput,
  CreatePayoutInput,
  PayoutDto,
  PayoutStatus,
  RiderEarningsDto,
} from '@estene/contracts/payout';
import { api } from '@/lib/api';

export type BulkResult = {
  riderId: string;
  name: string;
  status: 'queued' | 'skipped';
  reason?: string;
  amount?: number;
};

export const payoutKeys = {
  all: ['payouts'] as const,
  earnings: ['payouts', 'earnings'] as const,
  riderEarnings: (id: string) => ['payouts', 'earnings', id] as const,
  list: (f: object) => ['payouts', 'list', f] as const,
  banks: ['payouts', 'banks'] as const,
};

export const useEarnings = () =>
  useQuery({
    queryKey: payoutKeys.earnings,
    queryFn: () => api.get<RiderEarningsDto[]>('/payouts/earnings'),
    refetchInterval: 30_000,
  });
export const useRiderEarnings = (id: string, enabled = true) =>
  useQuery({
    queryKey: payoutKeys.riderEarnings(id),
    queryFn: () => api.get<RiderEarningsDto>(`/payouts/earnings/${id}`),
    enabled,
  });
export const usePayouts = (f: { page: number; status?: PayoutStatus; riderId?: string }) =>
  useQuery({
    queryKey: payoutKeys.list(f),
    queryFn: () => api.get<Paginated<PayoutDto>>('/payouts', { ...f, limit: 20 }),
    placeholderData: keepPreviousData,
    // Transfers settle asynchronously — poll while anything is in flight.
    refetchInterval: (q) =>
      q.state.data?.items.some((p) => p.status === 'pending' || p.status === 'processing')
        ? 3_000
        : 30_000,
  });
export const useBanks = () =>
  useQuery({
    queryKey: payoutKeys.banks,
    queryFn: () => api.get<{ code: string; name: string }[]>('/payouts/banks'),
    staleTime: Infinity,
  });

function usePayoutMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payoutKeys.all });
      void qc.invalidateQueries({ queryKey: ['finance'] });
      void qc.invalidateQueries({ queryKey: ['riders'] });
    },
  });
}

export const useCreatePayout = () =>
  usePayoutMutation((input: CreatePayoutInput) => api.post<PayoutDto>('/payouts', input));
export const useBulkPayout = () =>
  usePayoutMutation((riderIds: string[]) => api.post<BulkResult[]>('/payouts/bulk', { riderIds }));
export const useRetryPayout = () =>
  usePayoutMutation((id: string) => api.post<PayoutDto>(`/payouts/${id}/retry`));
export const useSaveBankAccount = (riderId: string) =>
  usePayoutMutation((input: BankAccountInput) =>
    api.put<BankAccountDto>(`/payouts/riders/${riderId}/bank-account`, input),
  );
