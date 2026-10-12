import { useState } from 'react';
import { toast } from 'sonner';
import { formatNaira, koboToNaira, nairaToKobo } from '@estene/contracts/money';
import type { PayoutMethod, RiderEarningsDto } from '@estene/contracts/payout';
import { cn } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { useCreatePayout } from '../payouts.queries';

export function PayoutDialog({ rider, onClose }: { rider: RiderEarningsDto; onClose: () => void }) {
  const create = useCreatePayout();
  const [method, setMethod] = useState<PayoutMethod>(rider.bankAccount ? 'transfer' : 'manual');
  const [amount, setAmount] = useState(String(koboToNaira(Math.max(0, rider.available))));
  const [reference, setReference] = useState('');
  const kobo = nairaToKobo(Number(amount) || 0);
  const tooMuch = kobo > rider.available;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Pay ${rider.name}`}
        description={`${formatNaira(rider.available)} available after paid-out and cash held.`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payout method">
            {(
              [
                {
                  value: 'transfer',
                  title: 'Bank transfer',
                  hint: rider.bankAccount
                    ? `${rider.bankAccount.bankName} · ${rider.bankAccount.accountNumber}`
                    : 'No account on file',
                  disabled: !rider.bankAccount,
                },
                {
                  value: 'manual',
                  title: 'Already paid',
                  hint: 'Record a payment made outside Estene',
                },
              ] as const
            ).map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={method === m.value}
                disabled={'disabled' in m && m.disabled}
                onClick={() => setMethod(m.value)}
                className={cn(
                  'rounded-lg border p-3 text-left disabled:opacity-50',
                  method === m.value ? 'border-primary bg-primary-soft' : 'hover:bg-muted',
                )}
              >
                <span className="block text-sm font-semibold">{m.title}</span>
                <span className="text-muted-foreground block text-xs">{m.hint}</span>
              </button>
            ))}
          </div>
          <Field
            label="Amount (₦)"
            error={tooMuch ? `Max ${formatNaira(rider.available)}` : undefined}
          >
            <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          {method === 'manual' && (
            <Field label="Reference (optional)" hint="Bank or receipt reference for the record.">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={kobo <= 0 || tooMuch}
              loading={create.isPending}
              onClick={() =>
                create.mutate(
                  {
                    riderId: rider.riderId,
                    amount: kobo,
                    method,
                    reference: reference || undefined,
                  },
                  {
                    onSuccess: () => {
                      toast.success(method === 'transfer' ? 'Transfer sent' : 'Payout recorded');
                      onClose();
                    },
                  },
                )
              }
            >
              {method === 'transfer' ? `Send ${formatNaira(kobo)}` : 'Record payout'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
