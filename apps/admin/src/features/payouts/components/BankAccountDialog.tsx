import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { BankAccountDto } from '@estene/contracts/payout';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { useBanks, useSaveBankAccount } from '../payouts.queries';

/** The bank confirms the account name before it's saved, so payouts can't go to a mistyped account. */
export function BankAccountDialog({
  riderId,
  riderName,
  current,
  onClose,
}: {
  riderId: string;
  riderName: string;
  current: BankAccountDto | null;
  onClose: () => void;
}) {
  const banks = useBanks();
  const save = useSaveBankAccount(riderId);
  const [bankCode, setBankCode] = useState(current?.bankCode ?? '');
  const [accountNumber, setAccountNumber] = useState(current?.accountNumber ?? '');
  const valid = !!bankCode && /^\d{10}$/.test(accountNumber);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`${current ? 'Change' : 'Add'} payout account`}
        description={`Where ${riderName}'s earnings are sent.`}
      >
        {save.data ? (
          <div className="space-y-4 text-sm">
            <div className="bg-success-soft flex items-start gap-3 rounded-lg p-4">
              <ShieldCheck className="text-success mt-0.5 size-5" />
              <div>
                <p className="font-semibold">{save.data.accountName}</p>
                <p className="text-muted-foreground">
                  {save.data.bankName} · {save.data.accountNumber}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Name confirmed by the bank. Check it matches {riderName}.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(
                { bankCode, accountNumber },
                { onSuccess: () => toast.success('Account verified') },
              );
            }}
          >
            <Field label="Bank">
              <Select
                placeholder="Select bank"
                options={(banks.data ?? []).map((b) => ({ value: b.code, label: b.name }))}
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
              />
            </Field>
            <Field label="Account number" hint="10-digit NUBAN.">
              <Input
                inputMode="numeric"
                maxLength={10}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid} loading={save.isPending}>
                Verify & save
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
