import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { ShipmentStatus } from '@estene/contracts/enums';
import type { IntegrationShipmentDto } from '@estene/contracts/shipment';
import { api } from '@/lib/api';

export const useDeliveries = (f: { page: number; status?: ShipmentStatus; search?: string }) =>
  useQuery({
    queryKey: ['deliveries', f],
    queryFn: () =>
      api.get<Paginated<IntegrationShipmentDto>>('/portal/shipments', { ...f, limit: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

export const useDelivery = (ref: string) =>
  useQuery({
    queryKey: ['delivery', ref],
    queryFn: () => api.get<IntegrationShipmentDto>(`/portal/shipments/${encodeURIComponent(ref)}`),
    refetchInterval: 30_000,
  });
