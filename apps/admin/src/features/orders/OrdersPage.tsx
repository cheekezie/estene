import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PackageSearch, Search } from 'lucide-react';
import { ORDER_STATUSES, type OrderStatus } from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import { ORDER_STATUS_META } from '@estene/contracts/order-status';
import { formatRelativeDay } from '@estene/lib/date';
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
import { useOrders } from './orders.queries';

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label }));

export default function OrdersPage() {
  // Filters live in the URL so a filtered view can be shared or bookmarked.
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as OrderStatus | null) ?? undefined;
  const page = Number(params.get('page') ?? 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounce(search.trim());

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update({ q: debounced || undefined, page: undefined });
  }, [debounced]);

  const q = useOrders({ page, status, search: debounced || undefined });

  return (
    <>
      <PageHeader title="Orders" description="Every booking across the network." />
      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tracking no., name, phone or tag" className="pl-9" aria-label="Search orders" />
          </div>
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
            <EmptyState icon={PackageSearch} title="No orders found" description="Try a different status or search term." />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR><TH>Tracking no.</TH><TH>Route</TH><TH>Sender → Recipient</TH><TH>Rider</TH><TH>Status</TH><TH className="text-right">Amount</TH><TH>Booked</TH></TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((o) => (
                      <TR key={o.id} className="hover:bg-muted/50">
                        <TD>
                          <Link to={`/orders/${o.id}`} className="font-mono text-[13px] font-medium text-primary hover:underline">{o.trackingNumber}</Link>
                        </TD>
                        <TD className="whitespace-nowrap">
                          <span className="font-medium">{o.pickup.zone.code}</span>
                          <span className="mx-1.5 text-muted-foreground">→</span>
                          <span className="font-medium">{o.dropoff.zone.code}</span>
                        </TD>
                        <TD className="max-w-56 truncate text-muted-foreground">{o.pickup.contactName} → {o.dropoff.contactName}</TD>
                        <TD className="whitespace-nowrap">{o.rider?.name ?? <span className="text-muted-foreground">—</span>}</TD>
                        <TD><OrderStatusBadge status={o.status} /></TD>
                        <TD className="tabular text-right font-medium">{formatNaira(o.finalAmount ?? o.estimate.total)}</TD>
                        <TD className="whitespace-nowrap text-muted-foreground">{formatRelativeDay(o.createdAt)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={(p) => update({ page: String(p) })} />
              </>
            )
          )}
        </QueryState>
      </Card>
    </>
  );
}
