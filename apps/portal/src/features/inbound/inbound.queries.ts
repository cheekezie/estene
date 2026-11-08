import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { InboundCreateInput, InboundDto, InboundStatus } from '@estene/contracts/warehouse';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/shared/useInvalidatingMutation';

export const useInbounds = (f: { page: number; status?: InboundStatus }) =>
  useQuery({
    queryKey: ['inbounds', f],
    queryFn: () => api.get<Paginated<InboundDto>>('/portal/inbounds', { ...f, limit: 20 }),
    placeholderData: keepPreviousData,
  });

export const useCreateInbound = () =>
  useInvalidatingMutation((input: InboundCreateInput) =>
    api.post<InboundDto>('/portal/inbounds', input),
  );

export const useCancelInbound = () =>
  useInvalidatingMutation((ref: string) =>
    api.post<InboundDto>(`/portal/inbounds/${encodeURIComponent(ref)}/cancel`),
  );
