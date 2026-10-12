'use client';

import { useState } from 'react';
import { Check, Copy, Landmark } from 'lucide-react';
import type { VirtualAccountDto } from '@estene/contracts/payment';
import { formatNaira } from '@estene/contracts/money';
import { formatDateTime } from '@estene/lib/date';

/** "Send exactly ₦X to this account" — the account is unique to this shipment, so the payment matches itself. */
export function TransferInstructions({
  amount,
  account,
}: {
  amount: number;
  account: VirtualAccountDto;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-left">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <Landmark className="size-4" />
        Transfer exactly {formatNaira(amount)}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-amber-100">
        <div>
          <p className="text-xs text-slate-500">Account number</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-slate-900">
            {account.accountNumber}
          </p>
          <p className="text-sm text-slate-600">
            {account.bankName} · {account.accountName}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard.writeText(account.accountNumber).then(() => setCopied(true))
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        This account is only for this parcel and expires {formatDateTime(account.expiresAt)}. We
        confirm automatically — no need to send proof.
      </p>
    </div>
  );
}
