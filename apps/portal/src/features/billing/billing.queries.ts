import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckoutSession } from '@estene/contracts/payment';
import type { HandlingFeesViewDto } from '@estene/contracts/handling-fee';
import type { TransactionStatus } from '@estene/contracts/payment';
import { api } from '@/lib/api';

export const useHandlingFees = () =>
  useQuery({
    queryKey: ['handling-fees'],
    queryFn: () => api.get<HandlingFeesViewDto>('/portal/handling-fees'),
  });

/** Opens the payment provider's checkout for one month; it sends the client back to /billing. */
export const usePayFee = () =>
  useMutation({
    mutationFn: (feeId: string) => api.post<CheckoutSession>(`/portal/handling-fees/${feeId}/pay`),
    onSuccess: (session) => window.location.assign(session.checkoutUrl),
  });

/** Back from the checkout: ask the API to confirm with the provider, then refresh everything. */
export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      api.post<{ reference: string; status: TransactionStatus }>(
        `/portal/payments/${encodeURIComponent(ref)}/verify`,
      ),
    onSettled: () => void qc.invalidateQueries(),
  });
}
