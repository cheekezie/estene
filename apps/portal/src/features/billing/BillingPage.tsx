import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { Banknote, CalendarClock, Package, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import {
  cycleLastDay,
  HANDLING_FEE_STATUS_META,
  type HandlingFeeDto,
} from '@estene/contracts/handling-fee';
import { formatNaira } from '@estene/contracts/money';
import { formatDate } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { QueryState } from '@/shared/components/QueryState';
import { StatTile } from '@/shared/components/StatTile';
import { useHandlingFees, usePayFee, useVerifyPayment } from './billing.queries';

const period = (start: string, end: string) =>
  `${formatDate(start)} – ${formatDate(cycleLastDay(end))}`;

/** /billing — the warehouse handling fee, month by month, and paying it online. */
export default function BillingPage() {
  const q = useHandlingFees();
  const pay = usePayFee();
  useCheckoutReturn();
  const v = q.data;
  const c = v?.current;

  return (
    <>
      <PageHeader
        title="Handling fees"
        description="What we charge each month to keep your goods in our warehouse."
      />
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {v && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile
                label="To pay now"
                value={formatNaira(v.totalDue)}
                hint={v.nextDueAt ? `Next due ${formatDate(v.nextDueAt)}` : 'You’re all paid up'}
                icon={Banknote}
                highlight={v.fees.some((f) => f.overdue)}
              />
              <StatTile
                label="This month so far"
                value={c ? (c.free ? 'Free' : formatNaira(c.amount)) : '—'}
                hint={
                  c
                    ? `${c.units.billed} units · ${period(c.periodStart, c.periodEnd)}`
                    : 'No warehousing this month'
                }
                icon={Package}
              />
              <StatTile
                label="How it’s priced"
                value={`${formatNaira(v.settings.handlingFeePerBlock)} per ${v.settings.handlingUnitsPerBlock} units`}
                hint={`Billed monthly${v.activatedAt ? ` from ${formatDate(v.activatedAt)}` : ''}, due ${v.settings.handlingFeeDueDays} days after the month ends`}
                icon={CalendarClock}
              />
            </div>

            <Card className="text-muted-foreground p-4 text-sm">
              Each month counts the units on our shelves when it starts plus every unit you send in
              during it — units we ship out that month still count. Each block of{' '}
              {v.settings.handlingUnitsPerBlock} units, or part of one, costs{' '}
              {formatNaira(v.settings.handlingFeePerBlock)}. A month with no stock is free.
            </Card>

            <Card>
              {v.fees.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="Nothing billed yet"
                  description="Your first month is billed the day after it ends."
                />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Month</TH>
                      <TH className="text-right">Units</TH>
                      <TH className="text-right">Fee</TH>
                      <TH>Status</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {v.fees.map((f) => (
                      <FeeRow
                        key={f.id}
                        fee={f}
                        paying={pay.isPending && pay.variables === f.id}
                        onPay={() => pay.mutate(f.id)}
                      />
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          </div>
        )}
      </QueryState>
    </>
  );
}

function FeeRow({
  fee: f,
  paying,
  onPay,
}: {
  fee: HandlingFeeDto;
  paying: boolean;
  onPay: () => void;
}) {
  return (
    <TR className={cn(f.overdue && 'bg-destructive-soft/40')}>
      <TD>
        <p className="font-medium">{period(f.periodStart, f.periodEnd)}</p>
        <p className="text-muted-foreground text-xs">{f.reference}</p>
      </TD>
      <TD className="tabular text-right">
        {f.units.billed}
        <span className="text-muted-foreground block text-xs">
          {f.units.carriedIn} held + {f.units.added} new
        </span>
      </TD>
      <TD className="tabular text-right">
        {formatNaira(f.amount)}
        {f.amount !== f.listAmount && (
          <span className="text-muted-foreground block text-xs line-through">
            {formatNaira(f.listAmount)}
          </span>
        )}
      </TD>
      <TD>
        <Badge tone={f.overdue ? 'error' : HANDLING_FEE_STATUS_META[f.status].tone}>
          {f.overdue ? 'Overdue' : HANDLING_FEE_STATUS_META[f.status].label}
        </Badge>
        <p className="text-muted-foreground mt-1 text-xs">
          {f.paidAt
            ? `Paid ${formatDate(f.paidAt)}`
            : f.dueAt
              ? `Pay by ${formatDate(f.dueAt)}`
              : (f.note ?? '')}
        </p>
      </TD>
      <TD className="text-right">
        {f.status === 'due' && (
          <Button size="sm" loading={paying} onClick={onPay}>
            Pay {formatNaira(f.amount)}
          </Button>
        )}
      </TD>
    </TR>
  );
}

/** The checkout sends the client back with `?ref=`: confirm it once, say how it went, tidy the URL. */
function useCheckoutReturn() {
  const [params, setParams] = useSearchParams();
  const verify = useVerifyPayment();
  const done = useRef<string | null>(null);
  const ref = params.get('ref');

  useEffect(() => {
    if (!ref || done.current === ref) return;
    done.current = ref;
    verify.mutate(ref, {
      onSuccess: ({ status }) => {
        if (status === 'success') toast.success('Payment received — thank you');
        else if (status === 'pending')
          toast.info('We’re still waiting for your payment to clear. This page will update.');
        else toast.error('The payment didn’t go through. You can try again.');
      },
      onSettled: () => setParams({}, { replace: true }),
    });
  }, [ref, verify, setParams]);
}
