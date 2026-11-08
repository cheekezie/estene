import { useState } from 'react';
import { Link } from 'react-router';
import { PackagePlus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { INBOUND_STATUSES, type InboundDto, type InboundStatus } from '@estene/contracts/warehouse';
import { formatDate } from '@estene/lib/date';
import { humanize } from '@estene/lib/utils';
import { Badge, type BadgeTone } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useCancelInbound, useInbounds } from './inbound.queries';

const TONE: Record<InboundStatus, BadgeTone> = {
  expected: 'info',
  received: 'success',
  cancelled: 'neutral',
};

export default function InboundPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<InboundStatus | ''>('');
  const q = useInbounds({ page, status: status || undefined });
  const cancel = useCancelInbound();

  return (
    <>
      <PageHeader
        title="Inbound"
        description="Tell us what you’re sending to the warehouse; we count it in on arrival."
        actions={
          <Button asChild>
            <Link to="/inbound/new">
              <Plus />
              Book inbound
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="border-b p-4">
          <Select
            className="w-48"
            placeholder="All statuses"
            options={INBOUND_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as InboundStatus | '');
              setPage(1);
            }}
          />
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data && q.data.items.length === 0 ? (
            <EmptyState icon={PackagePlus} title="No inbounds yet" />
          ) : (
            q.data && (
              <>
                <div className="divide-y">
                  {q.data.items.map((i) => (
                    <InboundRow
                      key={i.id}
                      inbound={i}
                      cancelling={cancel.isPending && cancel.variables === i.number}
                      onCancel={() =>
                        cancel.mutate(i.number, {
                          onSuccess: () => toast.success(`${i.number} cancelled`),
                        })
                      }
                    />
                  ))}
                </div>
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

function InboundRow({
  inbound: i,
  cancelling,
  onCancel,
}: {
  inbound: InboundDto;
  cancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold">{i.number}</span>
            <Badge tone={TONE[i.status]} dot>
              {humanize(i.status)}
            </Badge>
            {i.transferFrom && <Badge>Moving from {i.transferFrom.code}</Badge>}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            To {i.office.name}
            {i.reference && ` · your ref ${i.reference}`}
            {i.status === 'received' && i.receivedAt
              ? ` · counted ${formatDate(i.receivedAt)}`
              : i.expectedAt
                ? ` · expected ${formatDate(i.expectedAt)}`
                : ''}
          </p>
        </div>
        {i.status === 'expected' && !i.transferFrom && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            loading={cancelling}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Product</TH>
            <TH className="text-right">Expected</TH>
            <TH className="text-right">Received</TH>
            <TH className="text-right">Damaged</TH>
          </TR>
        </THead>
        <TBody>
          {i.lines.map((l) => (
            <TR key={l.product.id}>
              <TD>
                {l.product.name}
                <span className="text-muted-foreground ml-2 font-mono text-xs">
                  {l.product.sku}
                </span>
              </TD>
              <TD className="tabular text-right">{l.expectedQty}</TD>
              <TD className="tabular text-right">
                {i.status === 'received' ? l.receivedQty : '—'}
              </TD>
              <TD className="tabular text-right">{i.status === 'received' ? l.damagedQty : '—'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
