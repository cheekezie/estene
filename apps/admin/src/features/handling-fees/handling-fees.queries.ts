import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminHandlingFeesViewDto,
  FreePeriodInput,
  HandlingFeeDto,
} from '@estene/contracts/handling-fee';
import { api } from '@/lib/api';

export const handlingFeeKeys = {
  all: ['handling-fees'] as const,
  client: (clientId: string) => ['handling-fees', clientId] as const,
};

export const useClientHandlingFees = (clientId: string) =>
  useQuery({
    queryKey: handlingFeeKeys.client(clientId),
    queryFn: () => api.get<AdminHandlingFeesViewDto>(`/handling-fees/clients/${clientId}`),
  });

function useFeeMutation<TVars, TResult>(clientId: string, fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: handlingFeeKeys.client(clientId) }),
  });
}

export const useWaiveFee = (clientId: string) =>
  useFeeMutation(clientId, ({ feeId, reason }: { feeId: string; reason: string }) =>
    api.post<HandlingFeeDto>(`/handling-fees/${feeId}/waive`, { reason }),
  );

export const useRecordFeePayment = (clientId: string) =>
  useFeeMutation(
    clientId,
    ({ feeId, ...body }: { feeId: string; reference?: string; note?: string }) =>
      api.post<HandlingFeeDto>(`/handling-fees/${feeId}/record-payment`, body),
  );

export const useAddFreePeriod = (clientId: string) =>
  useFeeMutation(clientId, (input: FreePeriodInput) =>
    api.post<AdminHandlingFeesViewDto>(`/handling-fees/clients/${clientId}/free-periods`, input),
  );

export const useRemoveFreePeriod = (clientId: string) =>
  useFeeMutation(clientId, (periodId: string) =>
    api.delete<AdminHandlingFeesViewDto>(
      `/handling-fees/clients/${clientId}/free-periods/${periodId}`,
    ),
  );
