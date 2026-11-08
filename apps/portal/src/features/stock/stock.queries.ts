import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { StockLevelDto, StockMovementDto } from '@estene/contracts/warehouse';
import { api } from '@/lib/api';

export const useStock = (f: { page: number; search?: string; lowOnly?: boolean; limit?: number }) =>
  useQuery({
    queryKey: ['stock', f],
    queryFn: () =>
      api.get<Paginated<StockLevelDto>>('/portal/stock', {
        page: f.page,
        search: f.search,
        limit: f.limit ?? 50,
        lowOnly: f.lowOnly ? 'true' : undefined,
      }),
    placeholderData: keepPreviousData,
  });

export const useMovements = (page: number) =>
  useQuery({
    queryKey: ['movements', page],
    queryFn: () => api.get<Paginated<StockMovementDto>>('/portal/movements', { page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
