import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Paginated } from '@estene/contracts/common';
import type { ProductDto, ProductInput } from '@estene/contracts/warehouse';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/shared/useInvalidatingMutation';

export const useProducts = (f: { page: number; search?: string }) =>
  useQuery({
    queryKey: ['products', f],
    queryFn: () => api.get<Paginated<ProductDto>>('/portal/products', { ...f, limit: 50 }),
    placeholderData: keepPreviousData,
  });

/** Every active product, for order and inbound line pickers. */
export const useProductOptions = () =>
  useQuery({
    queryKey: ['products', 'options'],
    queryFn: () =>
      api.get<Paginated<ProductDto>>('/portal/products', { active: 'true', limit: 100 }),
    select: (p) => p.items,
  });

export const useSaveProduct = () =>
  useInvalidatingMutation(({ sku, input }: { sku?: string; input: ProductInput }) => {
    if (!sku) return api.post<ProductDto>('/portal/products', input);
    const { sku: _sku, ...rest } = input;
    return api.patch<ProductDto>(`/portal/products/${encodeURIComponent(sku)}`, rest);
  });
