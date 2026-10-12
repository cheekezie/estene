import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from './errors';

/**
 * Shared defaults: no retries on 4xx, a failed mutation toasts its API
 * message unless the mutation handles `onError` itself.
 */
export function createQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.options.onError) return;
        if (error instanceof ApiError && error.status === 401) return;
        toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}
