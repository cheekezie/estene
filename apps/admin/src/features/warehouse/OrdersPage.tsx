import { useState } from 'react';
import { Link } from 'react-router';
import { PackageOpen, Plus } from 'lucide-react';
import { ORDER_STATUSES, ORDER_STATUS_META, type OrderStatus } from '@estene/contracts/warehouse';
import { formatRelativeDay } from '@estene/lib/date';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { ClientPicker } from './components/ClientPicker';
import { OrderStatusBadge } from './components/OrderStatusBadge';
import { useOrders, useSelectedClient } from './warehouse.queries';

/** Queue tabs: what the warehouse floor works through, in order. */
const QUEUE: (OrderStatus | '')[] = ['ready_to_pick', 'picking', 'awaiting_stock', 'returned', ''];

export default function OrdersPage() {
  const can = useCan();
  const [clientId, setClientId] = useSelectedClient();
  const [status, setStatus] = useState<OrderStatus | ''>('ready_to_pick');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const q = useOrders({
    clientId: clientId || undefined,
    status: status || undefined,
    search: debounced || undefined,
    page,
  });

  return (
    <>
      <PageHeader
        title="Warehouse orders"
        description="Orders from warehousing clients — by API or keyed in here. Packing one hands it to the network as a shipment."
        actions={
          can('ops_manager', 'office_agent', 'support') && (
            <Button asChild>
              <Link to={`/warehouse/orders/new${clientId ? `?client=${clientId}` : ''}`}>
                <Plus />
                New order
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {QUEUE.map((s) => (
          <Button
            key={s || 'all'}
            size="sm"
            variant={status === s ? 'primary' : 'outline'}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {s ? ORDER_STATUS_META[s].label : 'All orders'}
          </Button>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <ClientPicker
            value={clientId}
            placeholder="All clients"
            onChange={(id) => {
              setClientId(id);
              setPage(1);
            }}
          />
          <Input
            className="w-64"
            placeholder="Order no., reference or recipient"
            aria-label="Search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {status === '' && (
            <Select
              className="w-44"
              aria-label="Status"
              placeholder="Any status"
              options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label }))}
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus | '')}
            />
          )}
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data?.items.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="No orders here"
              description="Nothing in this queue right now."
            />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Order</TH>
                      <TH>Client</TH>
                      <TH>Recipient</TH>
                      <TH className="text-right">Units</TH>
                      <TH>Status</TH>
                      <TH>Received</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((o) => (
                      <TR key={o.id} className="hover:bg-muted/50">
                        <TD>
                          <Link
                            to={`/warehouse/orders/${o.id}`}
                            className="text-primary font-mono text-[13px] font-semibold hover:underline"
                          >
                            {o.number}
                          </Link>
                          {o.reference && (
                            <span className="text-muted-foreground block font-mono text-xs">
                              {o.reference}
                            </span>
                          )}
                        </TD>
                        <TD>
                          {o.client.name}
                          <span className="text-muted-foreground block text-xs">
                            {o.office.code}
                          </span>
                        </TD>
                        <TD>
                          {o.recipient.contactName}
                          <span className="text-muted-foreground block text-xs">
                            {o.deliveryMode === 'collection'
                              ? `Collect at ${o.destinationOffice?.name}`
                              : o.recipient.area}
                          </span>
                        </TD>
                        <TD className="tabular text-right">
                          {o.lines.reduce((n, l) => n + l.qty, 0)}
                        </TD>
                        <TD>
                          <OrderStatusBadge status={o.status} />
                          {o.status === 'returned' && !o.restockedAt && (
                            <span className="text-warning block text-xs">Needs restock</span>
                          )}
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
