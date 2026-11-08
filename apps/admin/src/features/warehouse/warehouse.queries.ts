import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import type { Paginated } from '@estene/contracts/common';
import type {
  AdminOrderCreateInput,
  InboundDto,
  InboundReceiveInput,
  InboundStatus,
  OrderDto,
  OrderPackInput,
  OrderRestockInput,
  OrderStatus,
  ProductDto,
  ProductInput,
  StockAdjustInput,
  StockLevelDto,
  StockMovementDto,
  StockTransferInput,
  WarehouseSummaryDto,
  WarehousingSettingsDto,
  WarehousingSettingsInput,
} from '@estene/contracts/warehouse';
import { api } from '@/lib/api';

export type WarehousingClientOption = {
  id: string;
  name: string;
  office: { id: string; name: string; code: string };
};

export const whKeys = {
  all: ['warehouse'] as const,
  clients: ['warehouse', 'clients'] as const,
  settings: (clientId: string) => ['warehouse', 'settings', clientId] as const,
  summary: (clientId: string) => ['warehouse', 'summary', clientId] as const,
  products: (f: object) => ['warehouse', 'products', f] as const,
  stock: (f: object) => ['warehouse', 'stock', f] as const,
  movements: (f: object) => ['warehouse', 'movements', f] as const,
  orders: (f: object) => ['warehouse', 'orders', f] as const,
  order: (id: string) => ['warehouse', 'order', id] as const,
  inbounds: (f: object) => ['warehouse', 'inbounds', f] as const,
};

/** The client being worked on lives in the URL (`?client=`), so it survives reloads and links. */
export function useSelectedClient() {
  const [params, setParams] = useSearchParams();
  const clientId = params.get('client') ?? '';
  const setClientId = (id: string) =>
    setParams(
      (p) => {
        if (id) p.set('client', id);
        else p.delete('client');
        return p;
      },
      { replace: true },
    );
  return [clientId, setClientId] as const;
}

export const useWarehousingClients = () =>
  useQuery({
    queryKey: whKeys.clients,
    queryFn: () => api.get<WarehousingClientOption[]>('/warehousing/clients'),
    staleTime: 60_000,
  });

export const useWarehousingSettings = (clientId: string) =>
  useQuery({
    queryKey: whKeys.settings(clientId),
    queryFn: () =>
      api.get<WarehousingSettingsDto | null>(`/warehousing/clients/${clientId}/settings`),
  });

export const useWarehouseSummary = (clientId: string, enabled = true) =>
  useQuery({
    queryKey: whKeys.summary(clientId),
    queryFn: () => api.get<WarehouseSummaryDto>(`/warehousing/clients/${clientId}/summary`),
    enabled: !!clientId && enabled,
  });

export const useProducts = (f: { clientId: string; page: number; search?: string }) =>
  useQuery({
    queryKey: whKeys.products(f),
    queryFn: () => api.get<Paginated<ProductDto>>('/warehousing/products', { ...f, limit: 50 }),
    enabled: !!f.clientId,
    placeholderData: keepPreviousData,
  });

/** Every active product for pickers (order and inbound lines). */
export const useProductOptions = (clientId: string) =>
  useQuery({
    queryKey: whKeys.products({ clientId, options: true }),
    queryFn: () =>
      api.get<Paginated<ProductDto>>('/warehousing/products', {
        clientId,
        active: 'true',
        limit: 100,
      }),
    enabled: !!clientId,
    select: (p) => p.items,
  });

export const useStock = (f: {
  clientId?: string;
  officeId?: string;
  page: number;
  search?: string;
  lowOnly?: boolean;
}) =>
  useQuery({
    queryKey: whKeys.stock(f),
    queryFn: () =>
      api.get<Paginated<StockLevelDto>>('/warehousing/stock', {
        ...f,
        lowOnly: f.lowOnly ? 'true' : undefined,
        limit: 50,
      }),
    enabled: !!(f.clientId || f.officeId),
    placeholderData: keepPreviousData,
  });

export const useMovements = (f: { clientId?: string; productId?: string; page: number }) =>
  useQuery({
    queryKey: whKeys.movements(f),
    queryFn: () =>
      api.get<Paginated<StockMovementDto>>('/warehousing/movements', { ...f, limit: 20 }),
    enabled: !!(f.clientId || f.productId),
    placeholderData: keepPreviousData,
  });

export const useOrders = (f: {
  clientId?: string;
  officeId?: string;
  status?: OrderStatus;
  search?: string;
  page: number;
}) =>
  useQuery({
    queryKey: whKeys.orders(f),
    queryFn: () => api.get<Paginated<OrderDto>>('/warehousing/orders', { ...f, limit: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

export const useOrder = (id: string) =>
  useQuery({
    queryKey: whKeys.order(id),
    queryFn: () => api.get<OrderDto>(`/warehousing/orders/${id}`),
    refetchInterval: 20_000,
  });

export const useInbounds = (f: {
  clientId?: string;
  officeId?: string;
  status?: InboundStatus;
  page: number;
}) =>
  useQuery({
    queryKey: whKeys.inbounds(f),
    queryFn: () => api.get<Paginated<InboundDto>>('/warehousing/inbounds', { ...f, limit: 20 }),
    placeholderData: keepPreviousData,
  });

/** Stock, orders and inbounds all affect each other — refresh the whole warehouse after any write. */
function useWarehouseMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: whKeys.all });
      void qc.invalidateQueries({ queryKey: ['shipments'] });
      void qc.invalidateQueries({ queryKey: ['office'] });
    },
  });
}

export const useSaveSettings = (clientId: string) =>
  useWarehouseMutation((input: WarehousingSettingsInput) =>
    api.put<WarehousingSettingsDto>(`/warehousing/clients/${clientId}/settings`, input),
  );

export const useSaveProduct = (clientId: string) =>
  useWarehouseMutation(({ id, input }: { id?: string; input: ProductInput }) => {
    if (!id) return api.post<ProductDto>('/warehousing/products', { ...input, clientId });
    const { sku: _sku, ...rest } = input;
    return api.patch<ProductDto>(`/warehousing/products/${id}`, rest);
  });

export const useAdjustStock = () =>
  useWarehouseMutation((input: StockAdjustInput) =>
    api.post<null>('/warehousing/stock/adjust', input),
  );

/** Moves units to another warehouse; they arrive there as an inbound to count. */
export const useTransferStock = () =>
  useWarehouseMutation((input: StockTransferInput) =>
    api.post<InboundDto>('/warehousing/transfers', input),
  );

export const useSetBin = () =>
  useWarehouseMutation((input: { productId: string; officeId: string; bin: string | null }) =>
    api.put<null>('/warehousing/stock/bin', input),
  );

export const useCreateOrder = () =>
  useWarehouseMutation((input: AdminOrderCreateInput) =>
    api.post<OrderDto>('/warehousing/orders', input),
  );

export const useStartPicking = (id: string) =>
  useWarehouseMutation(() => api.post<OrderDto>(`/warehousing/orders/${id}/pick`));
export const usePackOrder = (id: string) =>
  useWarehouseMutation((input: OrderPackInput) =>
    api.post<OrderDto>(`/warehousing/orders/${id}/pack`, input),
  );
export const useCancelOrder = (id: string) =>
  useWarehouseMutation((reason?: string) =>
    api.post<OrderDto>(`/warehousing/orders/${id}/cancel`, { reason }),
  );
export const useRestockOrder = (id: string) =>
  useWarehouseMutation((input: OrderRestockInput) =>
    api.post<OrderDto>(`/warehousing/orders/${id}/restock`, input),
  );

export const useCreateInbound = () =>
  useWarehouseMutation(
    (input: {
      clientId: string;
      reference?: string;
      expectedAt?: string;
      notes?: string;
      lines: { productId: string; expectedQty: number }[];
    }) => api.post<InboundDto>('/warehousing/inbounds', input),
  );
export const useReceiveInbound = (id: string) =>
  useWarehouseMutation((input: InboundReceiveInput) =>
    api.post<InboundDto>(`/warehousing/inbounds/${id}/receive`, input),
  );
export const useCancelInbound = (id: string) =>
  useWarehouseMutation(() => api.post<InboundDto>(`/warehousing/inbounds/${id}/cancel`));
