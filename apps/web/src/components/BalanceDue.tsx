'use client';

import { useState } from 'react';
import { CreditCard, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import type { PublicTrackingDto } from '@estene/contracts/shipment';
import type { VirtualAccountDto } from '@estene/contracts/payment';
import { formatNaira } from '@estene/contracts/money';
import { Button } from '@estene/ui/button';
import { PublicApiError, publicApi } from '@/lib/api';
import { TransferInstructions } from './TransferInstructions';

type Due = NonNullable<PublicTrackingDto['payment']>;

/** Shown on the tracking page while money is owed: unpaid booking, or a price raised at pickup. */
export function BalanceDue({ trackingNumber, due }: { trackingNumber: string; due: Due }) {
  const [account, setAccount] = useState<VirtualAccountDto | null>(due.virtualAccount);
  const [busy, setBusy] = useState<'checkout' | 'transfer' | null>(null);

  const start = async (channel: 'checkout' | 'transfer') => {
    setBusy(channel);
    try {
      const res = await publicApi.pay(trackingNumber, channel);
      if (res.checkout) return window.location.assign(res.checkout.checkoutUrl);
      if (res.transfer?.virtualAccount) setAccount(res.transfer.virtualAccount);
    } catch (e) {
      toast.error(e instanceof PublicApiError ? e.message : 'Could not start payment');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
        {due.reason === 'price_adjusted' ? 'Balance to pay' : 'Payment needed'}
      </p>
      <p className="font-display mt-1 text-3xl font-extrabold text-slate-900">
        {formatNaira(due.balanceDue)}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        {due.reason === 'price_adjusted'
          ? 'The rider found your parcel bigger or heavier than booked, so the price went up. Pay the difference before delivery — or the recipient can pay the rider in cash.'
          : 'Your booking is saved. We dispatch a rider as soon as payment is confirmed.'}
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          variant="accent"
          loading={busy === 'checkout'}
          onClick={() => start('checkout')}
        >
          <CreditCard />
          Pay online
        </Button>
        {!account && (
          <Button
            size="lg"
            variant="outline"
            loading={busy === 'transfer'}
            onClick={() => start('transfer')}
          >
            <Landmark />
            Pay by bank transfer
          </Button>
        )}
      </div>
      {account && (
        <div className="mt-5">
          <TransferInstructions amount={due.balanceDue} account={account} />
        </div>
      )}
    </div>
  );
}
