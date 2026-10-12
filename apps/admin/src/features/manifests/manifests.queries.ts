import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { ManifestStatus } from '@estene/contracts/enums';
import type { CreateManifestInput, ManifestDto } from '@estene/contracts/manifest';
import { api } from '@/lib/api';

export const useManifests = (f: { page: number; status?: ManifestStatus; officeId?: string }) =>
  useQuery({
    queryKey: ['manifests', 'list', f],
    queryFn: () => api.get<Paginated<ManifestDto>>('/manifests', { ...f, limit: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });

export const useManifest = (id: string) =>
  useQuery({
    queryKey: ['manifests', 'detail', id],
    queryFn: () => api.get<ManifestDto>(`/manifests/${id}`),
    refetchInterval: 10_000,
  });

function useManifestMutation<TVars>(fn: (v: TVars) => Promise<ManifestDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (m) => {
      qc.setQueryData(['manifests', 'detail', m.id], m);
      void qc.invalidateQueries({ queryKey: ['manifests', 'list'] });
      void qc.invalidateQueries({ queryKey: ['office'] });
      void qc.invalidateQueries({ queryKey: ['shipments'] });
    },
  });
}

export const useCreateManifest = () =>
  useManifestMutation((input: CreateManifestInput) => api.post<ManifestDto>('/manifests', input));
export const useUpdateManifest = (id: string) =>
  useManifestMutation((input: Record<string, string | undefined>) =>
    api.patch<ManifestDto>(`/manifests/${id}`, input),
  );
export const useLoadParcel = (id: string) =>
  useManifestMutation((code: string) =>
    api.post<ManifestDto>(`/manifests/${id}/shipments`, { code }),
  );
export const useUnloadParcel = (id: string) =>
  useManifestMutation((shipmentId: string) =>
    api.delete<ManifestDto>(`/manifests/${id}/shipments/${shipmentId}`),
  );
export const useDepart = (id: string) =>
  useManifestMutation(() => api.post<ManifestDto>(`/manifests/${id}/depart`));
export const useReceiveParcel = (id: string) =>
  useManifestMutation((code: string) =>
    api.post<ManifestDto>(`/manifests/${id}/receive`, { code }),
  );
export const useReceiveAll = (id: string) =>
  useManifestMutation(() => api.post<ManifestDto>(`/manifests/${id}/receive-all`));
