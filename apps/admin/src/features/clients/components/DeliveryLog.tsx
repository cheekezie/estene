import { useState } from 'react';
import { ChevronRight, RefreshCw, Search, Webhook } from 'lucide-react';
import type { WebhookDeliveryDto, WebhookDeliveryStatus } from '@estene/contracts/client';
import { WEBHOOK_EVENTS } from '@estene/contracts/enums';
import { WEBHOOK_EVENT_META } from '@estene/contracts/webhook-events';
import { formatRelativeDay } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardHeader, CardTitle } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useWebhookDeliveries } from '../clients.queries';
import { DeliveryDetailDialog } from './DeliveryDetailDialog';

export const DELIVERY_TONE = {
  pending: 'progress',
  delivered: 'success',
  failed: 'error',
} as const;
export const deliveryResultLabel = (
  d: Pick<WebhookDeliveryDto, 'status' | 'lastStatusCode' | 'attempts'>,
) =>
  d.status === 'delivered'
    ? `Delivered${d.lastStatusCode ? ` · ${d.lastStatusCode}` : ''}`
    : d.status === 'failed'
      ? 'Failed'
      : d.attempts > 0
        ? 'Retrying'
        : 'Queued';

const EVENT_OPTIONS = [
  { value: 'ping', label: 'Test event' },
  ...WEBHOOK_EVENTS.map((e) => ({ value: e, label: WEBHOOK_EVENT_META[e].title })),
];

/** Full delivery history (kept 30 days) with filters; a row opens the exact payload and response. */
export function DeliveryLog({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<WebhookDeliveryStatus | ''>('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const debounced = useDebounce(search.trim());

  const q = useWebhookDeliveries(clientId, {
    page,
    status: status || undefined,
    type: type || undefined,
    search: debounced || undefined,
  });
  const resetPage =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Delivery log</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            Every event sent in the last 30 days. Failures retry automatically for about an hour.
          </p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Refresh" onClick={() => q.refetch()}>
          <RefreshCw className={cn(q.isFetching && 'animate-spin')} />
        </Button>
      </CardHeader>

      <div className="flex flex-wrap gap-3 border-b p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Tracking no., event id or text"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            aria-label="Search deliveries"
          />
        </div>
        <Select
          className="w-48"
          aria-label="Event"
          placeholder="All events"
          options={EVENT_OPTIONS}
          value={type}
          onChange={(e) => resetPage(setType)(e.target.value)}
        />
        <Select
          className="w-40"
          aria-label="Result"
          placeholder="All results"
          options={[
            { value: 'delivered', label: 'Delivered' },
            { value: 'failed', label: 'Failed' },
            { value: 'pending', label: 'Retrying / queued' },
          ]}
          value={status}
          onChange={(e) => resetPage(setStatus)(e.target.value as WebhookDeliveryStatus | '')}
        />
      </div>

      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {q.data?.items.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title="No deliveries"
            description={
              status || type || debounced
                ? 'Nothing matches these filters.'
                : 'Send a test event to check the endpoint.'
            }
          />
        ) : (
          q.data && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Event</TH>
                    <TH>Shipment</TH>
                    <TH>Result</TH>
                    <TH className="text-right">Time</TH>
                    <TH>When</TH>
                    <TH className="w-8" />
                  </TR>
                </THead>
                <TBody>
                  {q.data.items.map((d) => (
                    <TR
                      key={d.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => setOpenId(d.id)}
                    >
                      <TD>
                        <p className="font-medium">{d.title}</p>
                        <p
                          className="text-muted-foreground max-w-md truncate text-xs"
                          title={d.summary}
                        >
                          {d.summary}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap font-mono text-xs">
                        {d.trackingNumber ?? '—'}
                      </TD>
                      <TD>
                        <Badge tone={DELIVERY_TONE[d.status]}>{deliveryResultLabel(d)}</Badge>
                        {d.lastError && d.status !== 'delivered' && (
                          <p
                            className="text-muted-foreground mt-1 max-w-48 truncate text-xs"
                            title={d.lastError}
                          >
                            {d.lastError}
                          </p>
                        )}
                      </TD>
                      <TD className="tabular text-muted-foreground text-right">
                        {d.lastDurationMs != null ? `${d.lastDurationMs} ms` : '—'}
                      </TD>
                      <TD className="text-muted-foreground whitespace-nowrap">
                        {formatRelativeDay(d.createdAt)}
                      </TD>
                      <TD>
                        <ChevronRight className="text-muted-foreground size-4" />
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

      <DeliveryDetailDialog
        clientId={clientId}
        deliveryId={openId}
        canManage={canManage}
        onClose={() => setOpenId(null)}
      />
    </Card>
  );
}
