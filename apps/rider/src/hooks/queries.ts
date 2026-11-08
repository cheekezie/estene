import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { PayoutDto, RiderEarningsDto } from '@estene/contracts/payout';
import type { RiderDto } from '@estene/contracts/rider';
import type { ShipmentStatus } from '@estene/contracts/enums';
import type { ShipmentDto } from '@estene/contracts/shipment';
import { api } from '../lib/api';
import { OFFER_POLL_MS } from '../lib/config';

export type OfferDto = {
  offerId: string;
  expiresAt: string;
  distanceKm: number;
  shipment: ShipmentDto;
};

export const keys = {
  me: ['me'] as const,
  offers: ['offers'] as const,
  jobs: ['jobs'] as const,
  earnings: ['earnings'] as const,
  payouts: ['payouts'] as const,
  history: ['history'] as const,
};

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: () => api.get<RiderDto>('/api/rider/me') });

/** Polled while online and on screen; pushes trigger an immediate refetch. */
export const useOffers = (online: boolean) =>
  useQuery({
    queryKey: keys.offers,
    queryFn: () => api.get<OfferDto[]>('/api/rider/offers'),
    enabled: online,
    refetchInterval: online ? OFFER_POLL_MS : false,
  });

export const useJobs = () =>
  useQuery({
    queryKey: keys.jobs,
    queryFn: () => api.get<ShipmentDto[]>('/api/rider/jobs'),
    refetchInterval: 30_000,
  });

export const useJob = (id: string) => {
  const jobs = useJobs();
  return { ...jobs, job: jobs.data?.find((j) => j.id === id) };
};

export const useEarnings = () =>
  useQuery({
    queryKey: keys.earnings,
    queryFn: () => api.get<RiderEarningsDto>('/api/rider/earnings'),
  });

export const usePayouts = () =>
  useQuery({
    queryKey: keys.payouts,
    queryFn: () => api.get<Paginated<PayoutDto>>('/api/rider/payouts?page=1&limit=20'),
  });

export const useHistory = () =>
  useQuery({
    queryKey: keys.history,
    queryFn: () => api.get<Paginated<ShipmentDto>>('/api/rider/history?page=1&limit=20'),
  });

/** Every job action returns the updated shipment; refresh the lists around it. */
export function useJobAction<TInput>(run: (input: TInput) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.jobs });
      void qc.invalidateQueries({ queryKey: keys.offers });
      void qc.invalidateQueries({ queryKey: keys.earnings });
      void qc.invalidateQueries({ queryKey: keys.history });
    },
  });
}

export const advance = (id: string, status: ShipmentStatus, note?: string) =>
  api.post<ShipmentDto>(`/api/rider/jobs/${id}/advance`, { status, note });
