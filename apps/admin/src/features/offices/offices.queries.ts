import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OfficeDto, OfficeInput } from '@estene/contracts/office';
import { api } from '@/lib/api';

export const useOffices = () =>
  useQuery({
    queryKey: ['offices'],
    queryFn: () => api.get<OfficeDto[]>('/offices'),
    staleTime: 5 * 60_000,
  });

export const officeOptions = (offices: OfficeDto[] = []) =>
  offices
    .filter((o) => o.isActive)
    .map((o) => ({ value: o.id, label: `${o.name} · ${o.zone.city} (${o.code})` }));

export function useSaveOffice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: OfficeInput }) =>
      id ? api.patch<OfficeDto>(`/offices/${id}`, input) : api.post<OfficeDto>('/offices', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offices'] }),
  });
}
