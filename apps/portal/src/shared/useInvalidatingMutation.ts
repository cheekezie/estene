import { useMutation, useQueryClient } from '@tanstack/react-query';

/** Stock, orders, inbounds and the overview all move together — refresh everything after a write. */
export function useInvalidatingMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries(),
  });
}
