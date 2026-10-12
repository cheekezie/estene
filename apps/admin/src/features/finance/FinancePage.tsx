import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, HandCoins, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { Paginated } from '@estene/contracts/common';
import type { LedgerEntryType } from '@estene/contracts/enums';
import { formatNaira, nairaToKobo } from '@estene/contracts/money';
import { formatDateTime } from '@estene/lib/date';
import { cn, humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Card, CardHeader, CardTitle } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { api } from '@/lib/api';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { StatTile } from '@/shared/components/StatTile';

type Summary = {
  grossBookings: number;
  platformRevenue: number;
  riderEarnings: number;
  payouts: number;
  cashOutstanding: number;
  deliveredShipments: number;
};
type Balance = {
  riderId: string;
  name: string;
  code?: string;
  type?: 'company' | 'partner';
  earnings: number;
  paidOut: number;
  cashHeld: number;
  balance: number;
};
type Entry = {
  _id: string;
  type: LedgerEntryType;
  amount: number;
  rider?: { firstName: string; lastName: string; code: string };
  shipment?: { trackingNumber: string };
  reference?: string;
  note?: string;
  createdAt: string;
};
type MoneyAction = { kind: 'payout' | 'remittance'; rider: Balance };

export default function FinancePage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<MoneyAction | null>(null);
  const summary = useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: () => api.get<Summary>('/finance/summary'),
  });
  const balances = useQuery({
    queryKey: ['finance', 'balances'],
    queryFn: () => api.get<Balance[]>('/finance/rider-balances'),
  });
  const entries = useQuery({
    queryKey: ['finance', 'entries', page],
    queryFn: () => api.get<Paginated<Entry>>('/finance/entries', { page, limit: 15 }),
    placeholderData: keepPreviousData,
  });
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Finance"
        description="Bookings, Estene revenue, partner payouts and cash held by riders."
      />
      <QueryState isLoading={summary.isLoading} error={summary.error} rows={1}>
        {s && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Gross bookings"
              value={formatNaira(s.grossBookings)}
              hint={`${s.deliveredShipments} delivered shipments`}
              icon={Receipt}
            />
            <StatTile
              label="Estene revenue"
              value={formatNaira(s.platformRevenue)}
              hint="Company trips + partner commission"
              icon={Banknote}
              highlight
            />
            <StatTile
              label="Owed to partners"
              value={formatNaira(s.riderEarnings - s.payouts)}
              hint={`${formatNaira(s.payouts)} paid out so far`}
              icon={Wallet}
            />
            <StatTile
              label="Cash with riders"
              value={formatNaira(s.cashOutstanding)}
              hint="Collected, not yet remitted"
              icon={HandCoins}
            />
          </div>
        )}
      </QueryState>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rider balances</CardTitle>
            <span className="text-muted-foreground text-xs">
              + we owe them · − they hold our cash
            </span>
          </CardHeader>
          <QueryState isLoading={balances.isLoading} error={balances.error} rows={4}>
            {balances.data?.length === 0 ? (
              <p className="text-muted-foreground px-5 py-10 text-center text-sm">
                No rider money movements yet.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Rider</TH>
                    <TH className="text-right">Cash held</TH>
                    <TH className="text-right">Balance</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {balances.data?.map((b) => (
                    <TR key={b.riderId}>
                      <TD>
                        <p className="font-medium">{b.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {b.code} · {humanize(b.type ?? '')}
                        </p>
                      </TD>
                      <TD className="tabular text-right">{formatNaira(b.cashHeld)}</TD>
                      <TD
                        className={cn(
                          'tabular text-right font-semibold',
                          b.balance < 0 ? 'text-destructive' : b.balance > 0 && 'text-success',
                        )}
                      >
                        {formatNaira(b.balance)}
                      </TD>
                      <TD className="whitespace-nowrap text-right">
                        {b.cashHeld > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAction({ kind: 'remittance', rider: b })}
                          >
                            Cash in
                          </Button>
                        )}
                        {b.type === 'partner' && b.balance > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAction({ kind: 'payout', rider: b })}
                          >
                            Pay out
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </QueryState>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ledger</CardTitle>
          </CardHeader>
          <QueryState isLoading={entries.isLoading} error={entries.error} rows={6}>
            {entries.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Entry</TH>
                      <TH>For</TH>
                      <TH className="text-right">Amount</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {entries.data.items.map((e) => (
                      <TR key={e._id}>
                        <TD>
                          <p className="font-medium">{humanize(e.type)}</p>
                          <p className="text-muted-foreground text-xs">
                            {formatDateTime(e.createdAt)}
                          </p>
                        </TD>
                        <TD className="text-muted-foreground">
                          {e.shipment?.trackingNumber && (
                            <span className="font-mono text-xs">{e.shipment.trackingNumber}</span>
                          )}
                          {e.rider && (
                            <span className="block text-xs">
                              {e.rider.firstName} {e.rider.lastName}
                            </span>
                          )}
                          {e.note && <span className="block text-xs">{e.note}</span>}
                        </TD>
                        <TD className="tabular text-right font-medium">{formatNaira(e.amount)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pagination
                  page={entries.data.page}
                  totalPages={entries.data.totalPages}
                  total={entries.data.total}
                  onPage={setPage}
                />
              </>
            )}
          </QueryState>
        </Card>
      </div>

      {action && <MoneyDialog action={action} onClose={() => setAction(null)} />}
    </>
  );
}

function MoneyDialog({ action, onClose }: { action: MoneyAction; onClose: () => void }) {
  const qc = useQueryClient();
  const isPayout = action.kind === 'payout';
  const suggested = isPayout ? action.rider.balance : action.rider.cashHeld;
  const [amount, setAmount] = useState(String(suggested / 100));
  const [reference, setReference] = useState('');

  const record = useMutation({
    mutationFn: () =>
      api.post(isPayout ? '/finance/payouts' : '/finance/remittances', {
        riderId: action.rider.riderId,
        amount: nairaToKobo(Number(amount)),
        reference: reference || undefined,
      }),
    onSuccess: () => {
      toast.success(isPayout ? 'Payout recorded' : 'Cash remittance recorded');
      void qc.invalidateQueries({ queryKey: ['finance'] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={isPayout ? `Pay ${action.rider.name}` : `Cash in from ${action.rider.name}`}
        description={
          isPayout
            ? 'Record a transfer you have already made to this partner.'
            : 'Record cash the rider has handed over.'
        }
      >
        <div className="space-y-4">
          <Field label="Amount (₦)">
            <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field
            label="Reference (optional)"
            hint={isPayout ? 'Bank transfer reference' : 'Receipt number'}
          >
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={record.isPending}
              disabled={!(Number(amount) > 0)}
              onClick={() => record.mutate()}
            >
              Record
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
