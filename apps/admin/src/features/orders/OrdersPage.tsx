import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Building2, PackageSearch, Plus, Search } from 'lucide-react';
import { ORDER_STATUSES, type OrderStatus } from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import { ORDER_STATUS_META } from '@estene/contracts/order-status';
import { formatRelativeDay } from '@estene/lib/date';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Input } from '@estene/ui/input';
import { OrderStatusBadge } from '@estene/ui/OrderStatusBadge';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { useClientOptions } from '../clients/clients.queries';
import { useOrders } from './orders.queries';

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label }));

export default function OrdersPage() {
  // Filters live in the URL so a filtered view can be shared or bookmarked.
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as OrderStatus | null) ?? undefined;
  const page = Number(params.get('page') ?? 1);
  const clientId = params.get('clientId') ?? undefined;
  const can = useCan();
  const clients = useClientOptions();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounce(search.trim());

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced)
      update({ q: debounced || undefined, page: undefined });
  }, [debounced]);

  const q = useOrders({ page, status, clientId, search: debounced || undefined });

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every booking across the network."
        actions={
          can('ops_manager', 'dispatcher', 'support') && (
            <Button asChild>
              <Link to="/orders/new">
                <Plus />
                New order
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tracking no., name, phone or tag"
              className="pl-9"
              aria-label="Search orders"
            />
          </div>
          <Select
            className="w-52"
            aria-label="Filter by client"
            placeholder="All customers"
            options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={clientId ?? ''}
            onChange={(e) => update({ clientId: e.target.value || undefined, page: undefined })}
          />
          <Select
            className="w-52"
            aria-label="Filter by status"
            placeholder="All statuses"
            options={STATUS_OPTIONS}
            value={status ?? ''}
            onChange={(e) => update({ status: e.target.value || undefined, page: undefined })}
          />
        </div>

        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data && q.data.items.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="No orders found"
              description="Try a different status or search term."
            />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Tracking no.</TH>
                      <TH>Route</TH>
                      <TH>Sender → Recipient</TH>
                      <TH>Rider</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Amount</TH>
                      <TH>Booked</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((o) => (
                      <TR key={o.id} className="hover:bg-muted/50">
                        <TD>
                          <Link
                            to={`/orders/${o.id}`}
                            className="text-primary font-mono text-[13px] font-medium hover:underline"
                          >
                            {o.trackingNumber}
                          </Link>
                        </TD>
                        <TD className="whitespace-nowrap">
                          <span className="font-medium">{o.pickup.zone.code}</span>
                          <span className="text-muted-foreground mx-1.5">→</span>
                          <span className="font-medium">{o.dropoff.zone.code}</span>
                        </TD>
                        <TD className="text-muted-foreground max-w-60">
                          {o.client && (
                            <Badge tone="info" className="mb-0.5">
                              <Building2 className="size-3" />
                              {o.client.name}
                            </Badge>
                          )}
                          <p className="truncate">
                            {o.pickup.contactName} → {o.dropoff.contactName}
                          </p>
                        </TD>
                        <TD className="whitespace-nowrap">
                          {o.rider?.name ?? <span className="text-muted-foreground">—</span>}
                        </TD>
                        <TD>
                          <OrderStatusBadge status={o.status} />
                        </TD>
                        <TD className="tabular text-right font-medium">
                          {formatNaira(o.finalAmount ?? o.estimate.total)}
                        </TD>
                        <TD className="text-muted-foreground whitespace-nowrap">
                          {formatRelativeDay(o.createdAt)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pagination
                  page={q.data.page}
                  totalPages={q.data.totalPages}
                  total={q.data.total}
                  onPage={(p) => update({ page: String(p) })}
                />
              </>
            )
          )}
        </QueryState>
      </Card>
    </>
  );
}
