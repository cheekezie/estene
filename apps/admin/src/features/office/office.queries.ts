import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ManifestDto } from '@estene/contracts/manifest';
import type { ConfirmPickupInput, ShipmentDto } from '@estene/contracts/shipment';
import { api } from '@/lib/api';

export type OfficeAction =
  | 'receive_dropoff'
  | 'receive_from_rider'
  | 'receive_from_manifest'
  | 'add_to_manifest'
  | 'mark_ready_for_collection'
  | 'hand_to_recipient'
  | 'dispatch_for_delivery';

export type ScanResult = { shipment: ShipmentDto; actions: OfficeAction[] };

export type OfficeQueue = {
  office: { id: string; name: string; code: string };
  expectedDropoffs: ShipmentDto[];
  incomingRiders: ShipmentDto[];
  toSend: ShipmentDto[];
  toPrepareForCollection: ShipmentDto[];
  awaitingRider: ShipmentDto[];
  readyForCollection: ShipmentDto[];
  incomingManifests: ManifestDto[];
  openManifests: ManifestDto[];
};

export const useOfficeQueue = (officeId: string | undefined) =>
  useQuery({
    queryKey: ['office', officeId, 'queue'],
    queryFn: () => api.get<OfficeQueue>(`/office/${officeId}/queue`),
    enabled: !!officeId,
    refetchInterval: 15_000,
  });

/** Every counter action refreshes the queue, shipments and manifests. */
function useOfficeMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['office'] });
      void qc.invalidateQueries({ queryKey: ['shipments'] });
      void qc.invalidateQueries({ queryKey: ['manifests'] });
    },
  });
}

export const useScan = (officeId: string) =>
  useMutation({
    mutationFn: (code: string) => api.post<ScanResult>(`/office/${officeId}/scan`, { code }),
  });

export const useOfficeActions = (officeId: string) => ({
  receiveDropoff: useOfficeMutation(
    ({ shipmentId, input }: { shipmentId: string; input: ConfirmPickupInput }) =>
      api.post<ShipmentDto>(`/office/${officeId}/shipments/${shipmentId}/receive-dropoff`, input),
  ),
  receiveFromRider: useOfficeMutation((code: string) =>
    api.post<ShipmentDto>(`/office/${officeId}/receive-from-rider`, { code }),
  ),
  receiveFromManifest: useOfficeMutation((code: string) =>
    api.post<ShipmentDto>(`/office/${officeId}/receive-from-manifest`, { code }),
  ),
  readyForCollection: useOfficeMutation((shipmentId: string) =>
    api.post<ShipmentDto>(`/office/${officeId}/shipments/${shipmentId}/ready-for-collection`),
  ),
  handOver: useOfficeMutation(
    ({ shipmentId, ...body }: { shipmentId: string; pin: string; receivedBy?: string }) =>
      api.post<ShipmentDto>(`/office/${officeId}/shipments/${shipmentId}/hand-over`, body),
  ),
  dispatch: useOfficeMutation((shipmentId: string) =>
    api.post<ShipmentDto>(`/office/${officeId}/shipments/${shipmentId}/dispatch`),
  ),
});
