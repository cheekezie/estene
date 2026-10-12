import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ZoneDto, ZoneInput } from '@estene/contracts/zone';
import { api } from '@/lib/api';

export const useZones = () => useQuery({ queryKey: ['zones'], queryFn: () => api.get<ZoneDto[]>('/zones'), staleTime: 5 * 60_000 });

export const zoneOptions = (zones: ZoneDto[] = []) => zones.map((z) => ({ value: z.id, label: `${z.name} (${z.code})` }));

export function useSaveZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ZoneInput }) =>
      id ? api.patch<ZoneDto>(`/zones/${id}`, input) : api.post<ZoneDto>('/zones', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}
