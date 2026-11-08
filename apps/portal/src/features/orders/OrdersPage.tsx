import { useState } from 'react';
import { Link } from 'react-router';
import { PackageOpen, Plus } from 'lucide-react';
import { ORDER_STATUSES, ORDER_STATUS_META, type OrderStatus } from '@estene/contracts/warehouse';
import { formatRelativeDay } from '@estene/lib/date';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { OrderStatusBadge } from '@/shared/components/OrderStatusBadge';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useOrders } from './orders.queries';

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const q = useOrders({ page, status: status || undefined, search: debounced || undefined });

  return (
    <>
      <PageHeader
        title="Orders"
        description="Orders we pick, pack and ship from your stock."
        actions={
          <Button asChild>
            <Link to="/orders/new">
              <Plus />
              New order
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <Input
            className="max-w-xs"
            placeholder="Order number, reference or recipient"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            className="w-48"
            placeholder="All statuses"
            options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label }))}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OrderStatus | '');
              setPage(1);
            }}
          />
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data && q.data.items.length === 0 ? (
            <EmptyState icon={PackageOpen} title="No orders yet" />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Order</TH>
                      <TH>Recipient</TH>
                      <TH className="text-right">Items</TH>
                      <TH>Status</TH>
                      <TH>Tracking</TH>
                      <TH>Placed</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((o) => (
                      <TR key={o.id} className="hover:bg-muted/50">
                        <TD>
                          <Link
                            to={`/orders/${o.number}`}
                            className="text-primary font-mono font-semibold hover:underline"
                          >
                            {o.number}
                          </Link>
                          {o.reference && (
                            <span className="text-muted-foreground block text-xs">
                              ref {o.reference}
                            </span>
                          )}
                        </TD>
                        <TD>{o.recipient.contactName}</TD>
                        <TD className="tabular text-right">
                          {o.lines.reduce((n, l) => n + l.qty, 0)}
                        </TD>
                        <TD>
                          <OrderStatusBadge status={o.status} />
                        </TD>
                        <TD className="font-mono text-sm">
                          {o.shipment ? (
                            <Link
                              to={`/deliveries/${o.shipment.trackingNumber}`}
                              className="hover:underline"
                            >
                              {o.shipment.trackingNumber}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TD>
                        <TD className="text-muted-foreground text-sm">
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
                  onPage={setPage}
                />
              </>
            )
          )}
        </QueryState>
      </Card>
    </>
  );
}
