import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { ShipmentDto } from '@estene/contracts/shipment';
import type { ShipmentStatus } from '@estene/contracts/enums';
import { api } from '@/lib/api';

export type ShipmentFilters = {
  page: number;
  status?: ShipmentStatus;
  search?: string;
  zoneId?: string;
  riderId?: string;
  clientId?: string;
};

export const shipmentKeys = {
  all: ['shipments'] as const,
  list: (f: ShipmentFilters) => ['shipments', 'list', f] as const,
  detail: (id: string) => ['shipments', 'detail', id] as const,
};

export const useShipments = (filters: ShipmentFilters) =>
  useQuery({
    queryKey: shipmentKeys.list(filters),
    queryFn: () => api.get<Paginated<ShipmentDto>>('/shipments', { ...filters, limit: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });

export const useShipment = (id: string) =>
  useQuery({
    queryKey: shipmentKeys.detail(id),
    queryFn: () => api.get<ShipmentDto>(`/shipments/${id}`),
    refetchInterval: 15_000,
  });

/** All shipment actions return the updated shipment; seed the detail cache and refresh lists. */
function useShipmentAction<TVars>(fn: (vars: TVars) => Promise<ShipmentDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (shipment) => {
      qc.setQueryData(shipmentKeys.detail(shipment.id), shipment);
      void qc.invalidateQueries({ queryKey: ['shipments', 'list'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useAssignRider = (id: string) =>
  useShipmentAction((riderId: string) =>
    api.post<ShipmentDto>(`/shipments/${id}/assign`, { riderId }),
  );
export const useUnassignRider = (id: string) =>
  useShipmentAction((note?: string) =>
    api.post<ShipmentDto>(`/shipments/${id}/unassign`, { note }),
  );
export const useCancelShipment = (id: string) =>
  useShipmentAction((note?: string) => api.post<ShipmentDto>(`/shipments/${id}/cancel`, { note }));
export const useMarkPaid = (id: string) =>
  useShipmentAction(() => api.post<ShipmentDto>(`/shipments/${id}/mark-paid`));
