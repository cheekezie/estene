import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { RiderDto, RiderInput } from '@estene/contracts/rider';
import type {
  RiderApplicationDto,
  RiderApplicationStatus,
  RiderApplicationSummaryDto,
  RiderDocumentType,
} from '@estene/contracts/rider-application';
import { api } from '@/lib/api';

export type ApplicationFilters = { page: number; search?: string; status?: RiderApplicationStatus };
type ApplicationList = Paginated<RiderApplicationSummaryDto> & {
  counts: Partial<Record<RiderApplicationStatus, number>>;
};

const keys = {
  all: ['rider-applications'] as const,
  list: (f: ApplicationFilters) => ['rider-applications', 'list', f] as const,
  detail: (id: string) => ['rider-applications', 'detail', id] as const,
};

export const useRiderApplications = (f: ApplicationFilters) =>
  useQuery({
    queryKey: keys.list(f),
    queryFn: () => api.get<ApplicationList>('/rider-applications', { ...f, limit: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

export const useRiderApplication = (id: string) =>
  useQuery({
    queryKey: keys.detail(id),
    queryFn: () => api.get<RiderApplicationDto>(`/rider-applications/${id}`),
  });

/** Every change returns the updated application: write it to the cache, refresh the lists. */
function useApplicationMutation<V>(id: string, fn: (vars: V) => Promise<RiderApplicationDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (app) => {
      qc.setQueryData(keys.detail(id), app);
      void qc.invalidateQueries({ queryKey: [...keys.all, 'list'] });
    },
  });
}

export const useScheduleVetting = (id: string) =>
  useApplicationMutation(id, (v: { vettingAt?: string; officeId?: string; note?: string }) =>
    api.post<RiderApplicationDto>(`/rider-applications/${id}/vetting`, v),
  );

export const useAddApplicationNote = (id: string) =>
  useApplicationMutation(id, (note: string) =>
    api.post<RiderApplicationDto>(`/rider-applications/${id}/notes`, { note }),
  );

export const useUploadDocument = (id: string) =>
  useApplicationMutation(id, ({ type, file }: { type: RiderDocumentType; file: File }) =>
    api.upload<RiderApplicationDto>(`/rider-applications/${id}/documents`, file, {
      type,
      fileName: file.name,
    }),
  );

export const useRemoveDocument = (id: string) =>
  useApplicationMutation(id, (docId: string) =>
    api.delete<RiderApplicationDto>(`/rider-applications/${id}/documents/${docId}`),
  );

export const useRejectApplication = (id: string) =>
  useApplicationMutation(id, (reason: string) =>
    api.post<RiderApplicationDto>(`/rider-applications/${id}/reject`, { reason }),
  );

export function useApproveApplication(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RiderInput) =>
      api.post<{ application: RiderApplicationDto; rider: RiderDto; tempPassword: string }>(
        `/rider-applications/${id}/approve`,
        input,
      ),
    onSuccess: ({ application }) => {
      qc.setQueryData(keys.detail(id), application);
      void qc.invalidateQueries({ queryKey: [...keys.all, 'list'] });
      void qc.invalidateQueries({ queryKey: ['riders'] });
    },
  });
}

/** Opens a document through a 5-minute signed link. */
export const openDocument = async (appId: string, docId: string) => {
  // Open the tab first (synchronously, inside the click) so popup blockers allow it.
  const tab = window.open('', '_blank');
  try {
    const { url } = await api.get<{ url: string }>(
      `/rider-applications/${appId}/documents/${docId}/link`,
    );
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (e) {
    tab?.close();
    throw e;
  }
};
