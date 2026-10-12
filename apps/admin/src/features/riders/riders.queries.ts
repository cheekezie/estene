import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GeoPoint, Paginated } from '@estene/contracts/common';
import type { RiderStatus, RiderType } from '@estene/contracts/enums';
import type { RiderDto, RiderInput } from '@estene/contracts/rider';
import { api } from '@/lib/api';

export type RiderFilters = { page: number; search?: string; type?: RiderType; status?: RiderStatus };
export type RiderDetail = RiderDto & { lastLocation: (GeoPoint & { at: number }) | null };

export const useRiders = (f: RiderFilters) =>
  useQuery({ queryKey: ['riders', 'list', f], queryFn: () => api.get<Paginated<RiderDto>>('/riders', { ...f, limit: 20 }), placeholderData: keepPreviousData, refetchInterval: 30_000 });

export const useRider = (id: string) => useQuery({ queryKey: ['riders', 'detail', id], queryFn: () => api.get<RiderDetail>(`/riders/${id}`), refetchInterval: 20_000 });

export function useCreateRider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RiderInput) => api.post<{ rider: RiderDto; tempPassword: string }>('/riders', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['riders'] }),
  });
}

export function useSetRiderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: RiderStatus) => api.post<RiderDetail>(`/riders/${id}/status`, { status }),
    onSuccess: (rider) => {
      qc.setQueryData(['riders', 'detail', id], rider);
      void qc.invalidateQueries({ queryKey: ['riders', 'list'] });
    },
  });
}
