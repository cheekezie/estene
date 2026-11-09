import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HandlingFeeSettings } from '@estene/contracts/handling-fee';
import type { PricingConfig } from '@estene/contracts/pricing';
import { api } from '@/lib/api';

export type PlatformSettings = PricingConfig &
  HandlingFeeSettings & {
    partnerCommissionPct: number;
    maxActiveJobsPerRider: number;
    version: number;
  };
export type RouteRate = {
  id: string;
  zoneA: { id: string; name: string; code: string };
  zoneB: { id: string; name: string; code: string };
  fare: number;
};

export const usePricingConfig = () =>
  useQuery({
    queryKey: ['pricing', 'config'],
    queryFn: () => api.get<PlatformSettings>('/pricing/config'),
  });
export const useRouteRates = () =>
  useQuery({
    queryKey: ['pricing', 'routes'],
    queryFn: () => api.get<RouteRate[]>('/pricing/routes'),
  });

export function useSavePricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: Omit<PlatformSettings, 'version'>) =>
      api.put<PlatformSettings>('/pricing/config', s),
    onSuccess: (data) => qc.setQueryData(['pricing', 'config'], data),
  });
}

export function useSaveRouteRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: { originZoneId: string; destinationZoneId: string; fare: number }) =>
      api.put('/pricing/routes', r),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing', 'routes'] }),
  });
}

export function useDeleteRouteRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/pricing/routes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing', 'routes'] }),
  });
}
