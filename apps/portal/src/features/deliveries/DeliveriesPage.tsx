import { useState } from 'react';
import { Link } from 'react-router';
import { Package } from 'lucide-react';
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { formatRelativeDay } from '@estene/lib/date';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { ShipmentStatusBadge } from '@estene/ui/ShipmentStatusBadge';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useDeliveries } from './deliveries.queries';

export default function DeliveriesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ShipmentStatus | ''>('');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const q = useDeliveries({ page, status: status || undefined, search: debounced || undefined });

  return (
    <>
      <PageHeader title="Deliveries" description="Every parcel we carry for you." />
      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <Input
            className="max-w-xs"
            placeholder="Tracking number, reference or recipient"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            className="w-48"
            placeholder="All statuses"
            options={SHIPMENT_STATUSES.map((s) => ({
              value: s,
              label: SHIPMENT_STATUS_META[s].label,
            }))}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ShipmentStatus | '');
              setPage(1);
            }}
          />
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data && q.data.items.length === 0 ? (
            <EmptyState icon={Package} title="No deliveries yet" />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Tracking</TH>
                      <TH>Recipient</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Amount</TH>
                      <TH>Booked</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((s) => (
                      <TR key={s.id} className="hover:bg-muted/50">
                        <TD>
                          <Link
                            to={`/deliveries/${s.trackingNumber}`}
                            className="text-primary font-mono font-semibold hover:underline"
                          >
                            {s.trackingNumber}
                          </Link>
                          {s.clientReference && (
                            <span className="text-muted-foreground block text-xs">
                              ref {s.clientReference}
                            </span>
                          )}
                        </TD>
                        <TD>
                          {s.dropoff.contactName}
                          <span className="text-muted-foreground block text-xs">
                            {s.dropoff.area}
                          </span>
                        </TD>
                        <TD>
                          <ShipmentStatusBadge status={s.status} />
                        </TD>
                        <TD className="tabular text-right">
                          {formatNaira(s.amount.final ?? s.amount.estimate)}
                        </TD>
                        <TD className="text-muted-foreground text-sm">
                          {formatRelativeDay(s.createdAt)}
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
