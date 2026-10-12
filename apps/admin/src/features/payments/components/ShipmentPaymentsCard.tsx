import { useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { isPrepaid, PAYMENT_METHOD_LABELS, type PaymentStatus } from '@estene/contracts/enums';
import { formatNaira, koboToNaira, nairaToKobo } from '@estene/contracts/money';
import type { ShipmentDto } from '@estene/contracts/shipment';
import { formatRelativeDay } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { Badge, type BadgeTone } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { useCan } from '@/shared/hooks/useCan';
import { useIssueAccountNumber, useRecordPayment, useShipmentPayments } from '../payments.queries';
import { ChannelLabel, TransactionStatusBadge } from './TransactionBadges';
import { TransactionDetailDialog } from './TransactionDetailDialog';

const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = {
  unpaid: 'warning',
  partially_paid: 'warning',
  paid: 'success',
  overpaid: 'info',
  refunded: 'neutral',
};
const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Part paid',
  paid: 'Paid',
  overpaid: 'Refund due',
  refunded: 'Refunded',
};

/** Money for one shipment: owed vs. paid, every transaction, and the actions staff need. */
export function ShipmentPaymentsCard({ shipment: s }: { shipment: ShipmentDto }) {
  const q = useShipmentPayments(s.id);
  const issue = useIssueAccountNumber(s.id);
  const can = useCan();
  const [openId, setOpenId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const closed = ['cancelled', 'returned'].includes(s.status);
  const owed = s.finalAmount ?? s.estimate.total;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {PAYMENT_METHOD_LABELS[s.paymentMethod]}
          </span>
          <Badge tone={PAYMENT_TONE[s.paymentStatus]}>{PAYMENT_LABEL[s.paymentStatus]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="bg-muted/60 grid grid-cols-3 gap-3 rounded-lg p-3">
          <div>
            <dt className="text-muted-foreground text-xs">Owed</dt>
            <dd className="tabular font-semibold">{formatNaira(owed)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Paid</dt>
            <dd className="tabular font-semibold">{formatNaira(s.amountPaid)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              {s.balanceDue < 0 ? 'Refund due' : 'Balance'}
            </dt>
            <dd
              className={cn(
                'tabular font-semibold',
                s.balanceDue > 0 && 'text-warning',
                s.balanceDue < 0 && 'text-info',
              )}
            >
              {formatNaira(Math.abs(s.balanceDue))}
            </dd>
          </div>
        </dl>

        {q.data && q.data.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {q.data.map((t) => (
              <li key={t.id}>
                <button
                  className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  onClick={() => setOpenId(t.id)}
                >
                  <span>
                    <ChannelLabel channel={t.channel} />
                    <span className="text-muted-foreground block text-xs">
                      {t.purpose === 'balance' ? 'Balance' : 'Booking'} ·{' '}
                      {formatRelativeDay(t.paidAt ?? t.createdAt)}
                      {t.virtualAccount &&
                        t.status === 'pending' &&
                        ` · ${t.virtualAccount.accountNumber}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular font-medium">{formatNaira(t.amount)}</span>
                    <TransactionStatusBadge status={t.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {s.paymentMethod === 'on_account'
              ? 'Billed to the client’s account.'
              : 'No payments yet.'}
          </p>
        )}

        {!closed && s.balanceDue > 0 && (
          <div className="flex flex-wrap gap-2">
            {isPrepaid(s.paymentMethod) && (
              <Button
                size="sm"
                variant="outline"
                loading={issue.isPending}
                onClick={() =>
                  issue.mutate(undefined, {
                    onSuccess: (t) =>
                      toast.success(
                        `Account ${t.virtualAccount?.accountNumber} — ${formatNaira(t.amount)}`,
                      ),
                  })
                }
              >
                <Landmark />
                Account number for balance
              </Button>
            )}
            {can('finance') && (
              <Button size="sm" variant="ghost" onClick={() => setRecording(true)}>
                <Plus />
                Record payment
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <TransactionDetailDialog id={openId} onClose={() => setOpenId(null)} />
      {recording && (
        <RecordPaymentDialog
          shipmentId={s.id}
          suggested={s.balanceDue}
          onClose={() => setRecording(false)}
        />
      )}
    </Card>
  );
}

function RecordPaymentDialog({
  shipmentId,
  suggested,
  onClose,
}: {
  shipmentId: string;
  suggested: number;
  onClose: () => void;
}) {
  const record = useRecordPayment(shipmentId);
  const [amount, setAmount] = useState(String(koboToNaira(suggested)));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Record a payment"
        description="For money that reached Estene outside the gateway — a direct bank transfer or a settled client invoice."
      >
        <div className="space-y-4">
          <Field label="Amount (₦)">
            <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Bank / receipt reference (optional)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!(Number(amount) > 0)}
              loading={record.isPending}
              onClick={() =>
                record.mutate(
                  {
                    amount: nairaToKobo(Number(amount)),
                    reference: reference || undefined,
                    note: note || undefined,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Payment recorded');
                      onClose();
                    },
                  },
                )
              }
            >
              Record payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
