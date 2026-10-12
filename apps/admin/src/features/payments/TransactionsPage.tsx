import { useState } from 'react';
import { CheckCircle2, Clock, Receipt, Search, XCircle } from 'lucide-react';
import { formatNaira } from '@estene/contracts/money';
import {
  PAYMENT_CHANNELS,
  PAYMENT_CHANNEL_LABELS,
  type PaymentChannel,
  type TransactionStatus,
} from '@estene/contracts/payment';
import { formatRelativeDay } from '@estene/lib/date';
import { formatPhone, humanize } from '@estene/lib/utils';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { StatTile } from '@/shared/components/StatTile';
import { ChannelLabel, TransactionStatusBadge } from './components/TransactionBadges';
import { TransactionDetailDialog } from './components/TransactionDetailDialog';
import { useTransactionSummary, useTransactions } from './payments.queries';

const PERIODS = [
  { value: '', label: 'All time' },
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

/** Every payment into Estene — gateway checkouts, account-number transfers, rider cash and staff-recorded. */
export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<TransactionStatus | ''>('');
  const [channel, setChannel] = useState<PaymentChannel | ''>('');
  const [period, setPeriod] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const debounced = useDebounce(search.trim());

  const from = period
    ? new Date(new Date().setHours(0, 0, 0, 0) - (Number(period) - 1) * 86_400_000).toISOString()
    : undefined;
  const filters = {
    status: status || undefined,
    channel: channel || undefined,
    search: debounced || undefined,
    from,
  };
  const q = useTransactions({ page, ...filters });
  const summary = useTransactionSummary({ channel: filters.channel, search: filters.search, from });
  const reset =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every payment in — online checkout, bank transfers, cash collected by riders and payments recorded by staff."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Collected"
          value={s ? formatNaira(s.collected) : '—'}
          hint={`${s?.successful ?? 0} successful payments`}
          icon={Receipt}
          highlight
        />
        <StatTile label="Successful" value={s?.successful ?? '—'} icon={CheckCircle2} />
        <StatTile
          label="Pending"
          value={s?.pending ?? '—'}
          hint="Awaiting the customer or gateway"
          icon={Clock}
        />
        <StatTile label="Failed / expired" value={s?.failed ?? '—'} icon={XCircle} />
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Reference, tracking no., customer or phone"
              value={search}
              onChange={(e) => reset(setSearch)(e.target.value)}
              aria-label="Search transactions"
            />
          </div>
          <Select
            className="w-40"
            aria-label="Period"
            options={PERIODS}
            value={period}
            onChange={(e) => reset(setPeriod)(e.target.value)}
          />
          <Select
            className="w-56"
            aria-label="Channel"
            placeholder="All channels"
            options={PAYMENT_CHANNELS.map((c) => ({ value: c, label: PAYMENT_CHANNEL_LABELS[c] }))}
            value={channel}
            onChange={(e) => reset(setChannel)(e.target.value as PaymentChannel | '')}
          />
          <Select
            className="w-40"
            aria-label="Status"
            placeholder="All statuses"
            options={[
              { value: 'success', label: 'Successful' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
              { value: 'expired', label: 'Expired' },
            ]}
            value={status}
            onChange={(e) => reset(setStatus)(e.target.value as TransactionStatus | '')}
          />
        </div>

        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data?.items.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No transactions"
              description="Nothing matches these filters yet."
            />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Reference</TH>
                      <TH>Shipment</TH>
                      <TH>Customer</TH>
                      <TH>Channel</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Amount</TH>
                      <TH>When</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((t) => (
                      <TR
                        key={t.id}
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => setOpenId(t.id)}
                      >
                        <TD>
                          <p className="font-mono text-[13px] font-medium">{t.reference}</p>
                          <p className="text-muted-foreground text-xs">{humanize(t.purpose)}</p>
                        </TD>
                        <TD className="font-mono text-xs">{t.shipment?.trackingNumber ?? '—'}</TD>
                        <TD>
                          <p className="max-w-44 truncate">{t.client?.name ?? t.customer.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {formatPhone(t.customer.phone)}
                          </p>
                        </TD>
                        <TD>
                          <ChannelLabel channel={t.channel} />
                        </TD>
                        <TD>
                          <TransactionStatusBadge status={t.status} />
                        </TD>
                        <TD className="tabular text-right font-semibold">
                          {formatNaira(t.amount)}
                        </TD>
                        <TD className="text-muted-foreground whitespace-nowrap">
                          {formatRelativeDay(t.paidAt ?? t.createdAt)}
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
      <TransactionDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
