import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { PublicOfficeDto } from '@estene/contracts/office';
import type { OrderCreateInput, OrderDto, OrderStatus } from '@estene/contracts/warehouse';
import type { ZoneDto } from '@estene/contracts/zone';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/shared/useInvalidatingMutation';

export const useOrders = (f: { page: number; status?: OrderStatus; search?: string }) =>
  useQuery({
    queryKey: ['orders', f],
    queryFn: () => api.get<Paginated<OrderDto>>('/portal/orders', { ...f, limit: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

export const useOrder = (ref: string) =>
  useQuery({
    queryKey: ['order', ref],
    queryFn: () => api.get<OrderDto>(`/portal/orders/${encodeURIComponent(ref)}`),
    refetchInterval: 30_000,
  });

export const useCreateOrder = () =>
  useInvalidatingMutation((input: OrderCreateInput) => api.post<OrderDto>('/portal/orders', input));

export const useCancelOrder = (ref: string) =>
  useInvalidatingMutation((reason?: string) =>
    api.post<OrderDto>(`/portal/orders/${encodeURIComponent(ref)}/cancel`, { reason }),
  );

/** Public lists: the zones we deliver to (with `areas`) and offices for collection. */
export type PublicZone = Pick<ZoneDto, 'id' | 'name' | 'code' | 'areas'>;
export const useZones = () =>
  useQuery({
    queryKey: ['public', 'zones'],
    queryFn: () => api.get<PublicZone[]>('/public/zones'),
    staleTime: 10 * 60_000,
  });
export const useOffices = () =>
  useQuery({
    queryKey: ['public', 'offices'],
    queryFn: () => api.get<PublicOfficeDto[]>('/public/offices'),
    staleTime: 10 * 60_000,
  });
