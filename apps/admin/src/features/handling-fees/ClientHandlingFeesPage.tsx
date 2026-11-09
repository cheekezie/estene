import { useState } from 'react';
import { Banknote, CalendarClock, Gift, Package, Receipt, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  cycleLastDay,
  HANDLING_FEE_STATUS_META,
  type AdminHandlingFeesViewDto,
  type HandlingFeeDto,
} from '@estene/contracts/handling-fee';
import { formatNaira } from '@estene/contracts/money';
import { formatDate } from '@estene/lib/date';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { EmptyState } from '@estene/ui/EmptyState';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { Textarea } from '@estene/ui/textarea';
import { QueryState } from '@/shared/components/QueryState';
import { StatTile } from '@/shared/components/StatTile';
import { useCan } from '@/shared/hooks/useCan';
import { useClientContext } from '../clients/ClientLayout';
import {
  useAddFreePeriod,
  useClientHandlingFees,
  useRecordFeePayment,
  useRemoveFreePeriod,
  useWaiveFee,
} from './handling-fees.queries';

const period = (start: string, end: string) =>
  `${formatDate(start)} – ${formatDate(cycleLastDay(end))}`;

/** /clients/:id/handling-fees — what the client has been billed for warehousing, month by month. */
export default function ClientHandlingFeesPage() {
  const { client } = useClientContext();
  const q = useClientHandlingFees(client.id);
  return (
    <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
      {q.data &&
        (q.data.activatedAt ? (
          <FeesView clientId={client.id} view={q.data} />
        ) : (
          <Card>
            <EmptyState
              icon={Receipt}
              title="No handling fees yet"
              description="Billing starts the day warehousing is switched on for this client."
            />
          </Card>
        ))}
    </QueryState>
  );
}

function FeesView({ clientId, view }: { clientId: string; view: AdminHandlingFeesViewDto }) {
  const can = useCan();
  const canManage = can('ops_manager', 'finance');
  const canRecord = can('finance');
  const [waiving, setWaiving] = useState<HandlingFeeDto | null>(null);
  const [recording, setRecording] = useState<HandlingFeeDto | null>(null);
  const [givingFree, setGivingFree] = useState(false);
  const remove = useRemoveFreePeriod(clientId);
  const s = view.settings;
  const c = view.current;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label={c ? `This month so far (month ${c.cycle})` : 'This month'}
          value={c ? (c.free ? 'Free' : formatNaira(c.amount)) : '—'}
          hint={
            c
              ? `${c.units.billed} units · ${period(c.periodStart, c.periodEnd)}`
              : 'Warehousing is off'
          }
          icon={Package}
        />
        <StatTile
          label="Due now"
          value={formatNaira(view.totalDue)}
          hint={view.nextDueAt ? `Next due ${formatDate(view.nextDueAt)}` : 'Nothing unpaid'}
          icon={Banknote}
          highlight={view.fees.some((f) => f.overdue)}
        />
        <StatTile
          label="Price"
          value={`${formatNaira(s.handlingFeePerBlock)} / ${s.handlingUnitsPerBlock} units`}
          hint={`Monthly from ${formatDate(view.activatedAt!)} · due ${s.handlingFeeDueDays} days after`}
          icon={CalendarClock}
        />
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Free months</h2>
            <p className="text-muted-foreground text-sm">
              Months made free in advance, e.g. the first month. To cancel a month that’s already
              billed, waive it below.
            </p>
          </div>
          {canManage && (
            <Button variant="outline" onClick={() => setGivingFree(true)}>
              <Gift />
              Give free months
            </Button>
          )}
        </div>
        {view.freePeriods.length > 0 && (
          <ul className="mt-4 divide-y rounded-lg border">
            {view.freePeriods.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {p.fromCycle === p.toCycle
                      ? `Month ${p.fromCycle}`
                      : `Months ${p.fromCycle}–${p.toCycle}`}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {p.reason}
                    {p.createdBy && ` · ${p.createdBy}`} · {formatDate(p.createdAt)}
                  </p>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove free months ${p.fromCycle}–${p.toCycle}`}
                    loading={remove.isPending && remove.variables === p.id}
                    onClick={() =>
                      remove.mutate(p.id, { onSuccess: () => toast.success('Free time removed') })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="border-b p-4">
          <h2 className="font-semibold">Billed months</h2>
          <p className="text-muted-foreground text-sm">
            Units = what was on the shelves when the month started + everything added during it.
          </p>
        </div>
        {view.fees.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nothing billed yet"
            description="The first month is billed the day after it ends."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Month</TH>
                <TH className="text-right">Units</TH>
                <TH className="text-right">Fee</TH>
                <TH>Status</TH>
                <TH>Due / paid</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {view.fees.map((f) => (
                <TR key={f.id}>
                  <TD>
                    <p className="font-medium">Month {f.cycle}</p>
                    <p className="text-muted-foreground text-xs">
                      {period(f.periodStart, f.periodEnd)} · {f.reference}
                    </p>
                  </TD>
                  <TD className="tabular text-right">
                    {f.units.billed}
                    <span className="text-muted-foreground block text-xs">
                      {f.units.carriedIn} carried + {f.units.added} added
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
                    {f.note && <p className="text-muted-foreground mt-1 text-xs">{f.note}</p>}
                  </TD>
                  <TD className="text-muted-foreground whitespace-nowrap text-sm">
                    {f.paidAt
                      ? `Paid ${formatDate(f.paidAt)}`
                      : f.dueAt
                        ? `Due ${formatDate(f.dueAt)}`
                        : '—'}
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    {f.status === 'due' && (
                      <div className="flex justify-end gap-1">
                        {canRecord && (
                          <Button size="sm" variant="outline" onClick={() => setRecording(f)}>
                            Record payment
                          </Button>
                        )}
                        {canManage && (
                          <Button size="sm" variant="ghost" onClick={() => setWaiving(f)}>
                            Waive
                          </Button>
                        )}
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {waiving && (
        <WaiveDialog clientId={clientId} fee={waiving} onClose={() => setWaiving(null)} />
      )}
      {recording && (
        <RecordPaymentDialog
          clientId={clientId}
          fee={recording}
          onClose={() => setRecording(null)}
        />
      )}
      {givingFree && (
        <FreeMonthsDialog clientId={clientId} view={view} onClose={() => setGivingFree(false)} />
      )}
    </div>
  );
}

function WaiveDialog({
  clientId,
  fee,
  onClose,
}: {
  clientId: string;
  fee: HandlingFeeDto;
  onClose: () => void;
}) {
  const waive = useWaiveFee(clientId);
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Waive month ${fee.cycle}?`}
        description={`${period(fee.periodStart, fee.periodEnd)} · ${formatNaira(fee.amount)}. The client won’t owe this any more.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            waive.mutate(
              { feeId: fee.id, reason: reason.trim() },
              {
                onSuccess: () => {
                  toast.success(`Month ${fee.cycle} waived`);
                  onClose();
                },
              },
            );
          }}
        >
          <Field label="Reason" hint="The client sees this on their statement.">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              required
            />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={reason.trim().length < 3} loading={waive.isPending}>
              Waive {formatNaira(fee.amount)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({
  clientId,
  fee,
  onClose,
}: {
  clientId: string;
  fee: HandlingFeeDto;
  onClose: () => void;
}) {
  const record = useRecordFeePayment(clientId);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Record payment for month ${fee.cycle}`}
        description={`${formatNaira(fee.amount)} received outside the online checkout, e.g. a bank transfer.`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            record.mutate(
              {
                feeId: fee.id,
                reference: reference.trim() || undefined,
                note: note.trim() || undefined,
              },
              {
                onSuccess: () => {
                  toast.success('Payment recorded');
                  onClose();
                },
              },
            );
          }}
        >
          <Field label="Bank reference (optional)">
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Note (optional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={record.isPending}>
              Mark {formatNaira(fee.amount)} paid
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FreeMonthsDialog({
  clientId,
  view,
  onClose,
}: {
  clientId: string;
  view: AdminHandlingFeesViewDto;
  onClose: () => void;
}) {
  const add = useAddFreePeriod(clientId);
  const [from, setFrom] = useState(String(view.upcoming[0]?.cycle ?? ''));
  const [count, setCount] = useState('1');
  const [reason, setReason] = useState('');
  const n = Math.max(1, Math.min(36, Number(count) || 1));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Give free months"
        description="Those months are billed at ₦0 whatever stock is held."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(
              { fromCycle: Number(from), cycles: n, reason: reason.trim() },
              {
                onSuccess: () => {
                  toast.success(n === 1 ? 'Month made free' : `${n} months made free`);
                  onClose();
                },
              },
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Starting with">
              <Select
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                options={view.upcoming.map((u) => ({
                  value: String(u.cycle),
                  label: `Month ${u.cycle}: ${period(u.periodStart, u.periodEnd)}${u.free ? ' (free)' : ''}`,
                }))}
              />
            </Field>
            <Field label="How many">
              <Input
                type="number"
                min={1}
                max={36}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Reason" hint="e.g. First month free, festive promotion.">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!from || reason.trim().length < 3}
              loading={add.isPending}
            >
              <Gift />
              Make free
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
