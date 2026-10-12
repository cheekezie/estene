import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, Banknote, HandCoins, Landmark, RotateCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { formatNaira } from '@estene/contracts/money';
import type { PayoutStatus, RiderEarningsDto } from '@estene/contracts/payout';
import { formatRelativeDay } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { Badge, type BadgeTone } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { EmptyState } from '@estene/ui/EmptyState';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { StatTile } from '@/shared/components/StatTile';
import { BankAccountDialog } from './components/BankAccountDialog';
import { PayoutDialog } from './components/PayoutDialog';
import {
  useBulkPayout,
  useEarnings,
  usePayouts,
  useRetryPayout,
  type BulkResult,
} from './payouts.queries';

export const PAYOUT_TONE: Record<PayoutStatus, BadgeTone> = {
  pending: 'progress',
  processing: 'progress',
  success: 'success',
  failed: 'error',
};

export default function RiderPayoutsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'earnings';

  return (
    <>
      <PageHeader
        title="Rider payouts"
        description="What partner riders have earned, what they hold in cash, and paying them out."
      />
      <nav className="mb-6 flex gap-1 border-b" aria-label="Payout sections">
        {(['earnings', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setParams(t === 'earnings' ? {} : { tab: t }, { replace: true })}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium',
              tab === t
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {t === 'earnings' ? 'Earnings' : 'Payout history'}
          </button>
        ))}
      </nav>
      {tab === 'earnings' ? <EarningsTab /> : <HistoryTab />}
    </>
  );
}

function EarningsTab() {
  const q = useEarnings();
  const bulk = useBulkPayout();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState<RiderEarningsDto | null>(null);
  const [bankFor, setBankFor] = useState<RiderEarningsDto | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult[] | null>(null);

  const rows = q.data ?? [];
  const payable = useMemo(
    () => rows.filter((r) => r.type === 'partner' && r.available > 0 && r.bankAccount),
    [rows],
  );
  const totals = useMemo(
    () => ({
      owed: rows
        .filter((r) => r.type === 'partner')
        .reduce((s, r) => s + Math.max(0, r.available), 0),
      cash: rows.reduce((s, r) => s + Math.max(0, r.cashHeld), 0),
      paid: rows.reduce((s, r) => s + r.paidOut, 0),
      noBank: rows.filter((r) => r.type === 'partner' && !r.bankAccount && r.available > 0).length,
    }),
    [rows],
  );
  const selectedTotal = payable
    .filter((r) => selected.has(r.riderId))
    .reduce((s, r) => s + r.available, 0);
  const toggle = (id: string) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Ready to pay partners"
          value={formatNaira(totals.owed)}
          icon={Wallet}
          highlight={totals.owed > 0}
        />
        <StatTile
          label="Cash with riders"
          value={formatNaira(totals.cash)}
          hint="Collect before paying out"
          icon={HandCoins}
        />
        <StatTile label="Paid out to date" value={formatNaira(totals.paid)} icon={Banknote} />
        <StatTile
          label="Missing bank account"
          value={totals.noBank}
          hint="Partners with money waiting"
          icon={Landmark}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <p className="text-muted-foreground text-sm">
            {selected.size > 0 ? (
              <>
                <strong className="text-foreground">{selected.size}</strong> selected ·{' '}
                {formatNaira(selectedTotal)}
              </>
            ) : (
              'Select partners to pay several at once.'
            )}
          </p>
          <div className="flex gap-2">
            {payable.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelected(
                    selected.size === payable.length
                      ? new Set()
                      : new Set(payable.map((r) => r.riderId)),
                  )
                }
              >
                {selected.size === payable.length
                  ? 'Clear'
                  : `Select all payable (${payable.length})`}
              </Button>
            )}
            <Button
              size="sm"
              disabled={selected.size === 0}
              loading={bulk.isPending}
              onClick={() =>
                bulk.mutate([...selected], {
                  onSuccess: (r) => {
                    setBulkResult(r);
                    setSelected(new Set());
                  },
                })
              }
            >
              Pay selected
            </Button>
          </div>
        </div>

        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No rider earnings yet"
              description="Earnings appear here as partner riders complete deliveries."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-10" />
                  <TH>Rider</TH>
                  <TH className="text-right">Trips</TH>
                  <TH className="text-right">Fares</TH>
                  <TH className="text-right">Commission</TH>
                  <TH className="text-right">Earned</TH>
                  <TH className="text-right">Paid out</TH>
                  <TH className="text-right">Cash held</TH>
                  <TH className="text-right">Available</TH>
                  <TH>Payout account</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const canSelect = payable.includes(r);
                  const partner = r.type === 'partner';
                  return (
                    <TR key={r.riderId} className={cn(!partner && 'text-muted-foreground')}>
                      <TD>
                        {canSelect && (
                          <input
                            type="checkbox"
                            className="accent-primary size-4"
                            checked={selected.has(r.riderId)}
                            onChange={() => toggle(r.riderId)}
                            aria-label={`Select ${r.name}`}
                          />
                        )}
                      </TD>
                      <TD>
                        <Link
                          to={`/riders/${r.riderId}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {r.name}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {r.code} · {partner ? 'Partner' : 'Company (salaried)'}
                        </p>
                      </TD>
                      <TD className="tabular text-right">{r.deliveredTrips}</TD>
                      <TD className="tabular text-right">
                        {partner ? formatNaira(r.grossFares) : '—'}
                      </TD>
                      <TD className="tabular text-right">
                        {partner ? formatNaira(r.commission) : '—'}
                      </TD>
                      <TD className="tabular text-right">
                        {partner ? formatNaira(r.earnings) : '—'}
                      </TD>
                      <TD className="tabular text-right">
                        {partner ? formatNaira(r.paidOut + r.pendingPayouts) : '—'}
                      </TD>
                      <TD
                        className={cn(
                          'tabular text-right',
                          r.cashHeld > 0 && 'text-warning font-medium',
                        )}
                      >
                        {formatNaira(r.cashHeld)}
                      </TD>
                      <TD
                        className={cn(
                          'tabular text-right font-semibold',
                          r.available > 0 ? 'text-success' : r.available < 0 && 'text-destructive',
                        )}
                      >
                        {partner || r.available < 0 ? formatNaira(r.available) : '—'}
                      </TD>
                      <TD>
                        {r.bankAccount ? (
                          <button
                            className="text-left text-xs hover:underline"
                            onClick={() => setBankFor(r)}
                          >
                            <span className="text-foreground block font-medium">
                              {r.bankAccount.bankName}
                            </span>
                            <span className="text-muted-foreground">
                              {r.bankAccount.accountNumber}
                            </span>
                          </button>
                        ) : partner ? (
                          <Button size="sm" variant="ghost" onClick={() => setBankFor(r)}>
                            <Landmark />
                            Add
                          </Button>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD className="text-right">
                        {partner && r.available > 0 && (
                          <Button size="sm" variant="outline" onClick={() => setPaying(r)}>
                            Pay
                          </Button>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </QueryState>
        <p className="text-muted-foreground border-t px-4 py-3 text-xs">
          Available = earned − paid out − cash the rider still holds. Collect cash on the{' '}
          <Link to="/finance" className="text-primary hover:underline">
            Finance
          </Link>{' '}
          page to release it.
        </p>
      </Card>

      {paying && <PayoutDialog rider={paying} onClose={() => setPaying(null)} />}
      {bankFor && (
        <BankAccountDialog
          riderId={bankFor.riderId}
          riderName={bankFor.name}
          current={bankFor.bankAccount}
          onClose={() => setBankFor(null)}
        />
      )}
      {bulkResult && <BulkResultDialog results={bulkResult} onClose={() => setBulkResult(null)} />}
    </>
  );
}

function BulkResultDialog({ results, onClose }: { results: BulkResult[]; onClose: () => void }) {
  const queued = results.filter((r) => r.status === 'queued');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`${queued.length} payout${queued.length === 1 ? '' : 's'} sent`}
        description={`${formatNaira(queued.reduce((s, r) => s + (r.amount ?? 0), 0))} in total. Track them under Payout history.`}
      >
        <ul className="divide-y rounded-lg border text-sm">
          {results.map((r) => (
            <li key={r.riderId} className="flex items-center justify-between px-4 py-2.5">
              <span>{r.name}</span>
              {r.status === 'queued' ? (
                <Badge tone="success">{formatNaira(r.amount ?? 0)}</Badge>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <AlertTriangle className="size-3.5" />
                  {r.reason}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PayoutStatus | ''>('');
  const q = usePayouts({ page, status: status || undefined });
  const retry = useRetryPayout();

  return (
    <Card>
      <div className="flex justify-end border-b p-4">
        <Select
          className="w-44"
          aria-label="Status"
          placeholder="All payouts"
          options={[
            { value: 'success', label: 'Successful' },
            { value: 'processing', label: 'Processing' },
            { value: 'pending', label: 'Queued' },
            { value: 'failed', label: 'Failed' },
          ]}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PayoutStatus | '');
            setPage(1);
          }}
        />
      </div>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {q.data?.items.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No payouts yet"
            description="Payouts you send appear here with their bank status."
          />
        ) : (
          q.data && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Reference</TH>
                    <TH>Rider</TH>
                    <TH>Destination</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>When</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {q.data.items.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <p className="font-mono text-[13px]">{p.reference}</p>
                        {p.initiatedBy && (
                          <p className="text-muted-foreground text-xs">by {p.initiatedBy.name}</p>
                        )}
                      </TD>
                      <TD>
                        <Link to={`/riders/${p.rider.id}`} className="text-primary hover:underline">
                          {p.rider.name}
                        </Link>
                      </TD>
                      <TD className="text-xs">
                        {p.method === 'manual' ? (
                          <span className="text-muted-foreground">
                            Paid outside Estene{p.providerReference && ` · ${p.providerReference}`}
                          </span>
                        ) : p.bankAccount ? (
                          <>
                            {p.bankAccount.bankName}
                            <span className="text-muted-foreground block">
                              {p.bankAccount.accountNumber}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD>
                        <Badge tone={PAYOUT_TONE[p.status]} dot>
                          {p.status === 'pending'
                            ? 'Queued'
                            : p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </Badge>
                        {p.failureReason && (
                          <p
                            className="text-destructive mt-1 max-w-48 truncate text-xs"
                            title={p.failureReason}
                          >
                            {p.failureReason}
                          </p>
                        )}
                      </TD>
                      <TD className="tabular text-right font-semibold">{formatNaira(p.amount)}</TD>
                      <TD className="text-muted-foreground whitespace-nowrap">
                        {formatRelativeDay(p.completedAt ?? p.createdAt)}
                      </TD>
                      <TD className="text-right">
                        {p.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={retry.isPending}
                            onClick={() =>
                              retry.mutate(p.id, {
                                onSuccess: () => toast.success('Retrying transfer'),
                              })
                            }
                          >
                            <RotateCw />
                            Retry
                          </Button>
                        )}
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
  );
}
