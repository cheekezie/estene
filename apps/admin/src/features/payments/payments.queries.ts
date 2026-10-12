import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type {
  PaymentChannel,
  TransactionDetailDto,
  TransactionDto,
  TransactionStatus,
  TransactionSummaryDto,
} from '@estene/contracts/payment';
import { api } from '@/lib/api';

export type TransactionFilters = {
  page: number;
  status?: TransactionStatus;
  channel?: PaymentChannel;
  search?: string;
  from?: string;
  to?: string;
};

export const paymentKeys = {
  all: ['payments'] as const,
  list: (f: TransactionFilters) => ['payments', 'list', f] as const,
  summary: (f: Omit<TransactionFilters, 'page'>) => ['payments', 'summary', f] as const,
  detail: (id: string) => ['payments', 'detail', id] as const,
  forShipment: (id: string) => ['payments', 'shipment', id] as const,
};

export const useTransactions = (f: TransactionFilters) =>
  useQuery({
    queryKey: paymentKeys.list(f),
    queryFn: () => api.get<Paginated<TransactionDto>>('/payments', { ...f, limit: 25 }),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });

export const useTransactionSummary = (f: Omit<TransactionFilters, 'page'>) =>
  useQuery({
    queryKey: paymentKeys.summary(f),
    queryFn: () => api.get<TransactionSummaryDto>('/payments/summary', f),
    placeholderData: keepPreviousData,
  });

export const useTransaction = (id: string | null) =>
  useQuery({
    queryKey: paymentKeys.detail(id ?? ''),
    queryFn: () => api.get<TransactionDetailDto>(`/payments/${id}`),
    enabled: !!id,
  });

export const useShipmentPayments = (shipmentId: string) =>
  useQuery({
    queryKey: paymentKeys.forShipment(shipmentId),
    queryFn: () => api.get<TransactionDto[]>(`/payments/shipment/${shipmentId}`),
    refetchInterval: 15_000,
  });

/** Money changes ripple into shipments and finance views too. */
function usePaymentMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: paymentKeys.all });
      void qc.invalidateQueries({ queryKey: ['shipments'] });
      void qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export const useRequery = () =>
  usePaymentMutation((id: string) => api.post<TransactionDetailDto>(`/payments/${id}/requery`));
export const useSimulateTransfer = () =>
  usePaymentMutation((id: string) =>
    api.post<TransactionDetailDto>(`/payments/${id}/simulate-transfer`),
  );
export const useRecordPayment = (shipmentId: string) =>
  usePaymentMutation((body: { amount?: number; note?: string; reference?: string }) =>
    api.post<TransactionDto>(`/payments/shipment/${shipmentId}/record`, body),
  );
export const useIssueAccountNumber = (shipmentId: string) =>
  usePaymentMutation(() => api.post<TransactionDto>(`/payments/shipment/${shipmentId}/transfer`));
