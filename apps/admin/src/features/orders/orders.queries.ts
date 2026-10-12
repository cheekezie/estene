import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { OrderDto } from '@estene/contracts/order';
import type { OrderStatus } from '@estene/contracts/enums';
import { api } from '@/lib/api';

export type OrderFilters = {
  page: number;
  status?: OrderStatus;
  search?: string;
  zoneId?: string;
  riderId?: string;
  clientId?: string;
};

export const orderKeys = {
  all: ['orders'] as const,
  list: (f: OrderFilters) => ['orders', 'list', f] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
};

export const useOrders = (filters: OrderFilters) =>
  useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: () => api.get<Paginated<OrderDto>>('/orders', { ...filters, limit: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });

export const useOrder = (id: string) =>
  useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => api.get<OrderDto>(`/orders/${id}`),
    refetchInterval: 15_000,
  });

/** All order actions return the updated order; seed the detail cache and refresh lists. */
function useOrderAction<TVars>(fn: (vars: TVars) => Promise<OrderDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (order) => {
      qc.setQueryData(orderKeys.detail(order.id), order);
      void qc.invalidateQueries({ queryKey: ['orders', 'list'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useAssignRider = (id: string) =>
  useOrderAction((riderId: string) => api.post<OrderDto>(`/orders/${id}/assign`, { riderId }));
export const useUnassignRider = (id: string) =>
  useOrderAction((note?: string) => api.post<OrderDto>(`/orders/${id}/unassign`, { note }));
export const useCancelOrder = (id: string) =>
  useOrderAction((note?: string) => api.post<OrderDto>(`/orders/${id}/cancel`, { note }));
export const useMarkPaid = (id: string) =>
  useOrderAction(() => api.post<OrderDto>(`/orders/${id}/mark-paid`));
