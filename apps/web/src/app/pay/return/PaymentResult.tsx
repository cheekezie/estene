'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { formatNaira } from '@estene/contracts/money';
import { Button } from '@estene/ui/button';
import { publicApi } from '@/lib/api';

type Result = Awaited<ReturnType<typeof publicApi.verifyPayment>>;

/** Polls verification briefly — gateways can take a few seconds to settle after redirecting back. */
export function PaymentResult({ reference }: { reference: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return setError('Missing payment reference.');
    let cancelled = false;
    let tries = 0;
    const check = async () => {
      try {
        const r = await publicApi.verifyPayment(reference);
        if (cancelled) return;
        setResult(r);
        if (r.status === 'pending' && ++tries < 10) setTimeout(check, 3000);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [reference]);

  const tn = result?.trackingNumber;
  const card = 'rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm';

  if (error)
    return (
      <div className={card}>
        <XCircle className="text-destructive mx-auto size-12" />
        <h1 className="font-display mt-4 text-2xl font-bold">We couldn’t check this payment</h1>
        <p className="mt-2 text-slate-600">{error}</p>
      </div>
    );
  if (!result)
    return (
      <div className={card}>
        <Loader2 className="text-primary mx-auto size-10 animate-spin" />
        <p className="mt-4 text-slate-600">Confirming your payment…</p>
      </div>
    );

  if (result.status === 'success') {
    return (
      <div className={card}>
        <CheckCircle2 className="text-success mx-auto size-12" />
        <h1 className="font-display mt-4 text-2xl font-bold">Payment received</h1>
        <p className="mt-2 text-slate-600">
          {result.amount ? `${formatNaira(result.amount)} paid. ` : ''}We’re dispatching a rider now
          — you’ll get an SMS when they’re on the way.
        </p>
        {tn && <p className="mt-6 font-mono text-xl font-bold tracking-wider">{tn}</p>}
        {tn && (
          <Button asChild size="lg" className="mt-6">
            <Link href={`/track/${tn}`}>Track your parcel</Link>
          </Button>
        )}
      </div>
    );
  }

  if (result.status === 'pending') {
    return (
      <div className={card}>
        <Clock className="text-warning mx-auto size-12" />
        <h1 className="font-display mt-4 text-2xl font-bold">Payment still processing</h1>
        <p className="mt-2 text-slate-600">
          Your bank hasn’t confirmed yet. We’ll keep checking and text you once it clears — you can
          close this page.
        </p>
        {tn && (
          <Button asChild size="lg" variant="outline" className="mt-6">
            <Link href={`/track/${tn}`}>View parcel</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={card}>
      <XCircle className="text-destructive mx-auto size-12" />
      <h1 className="font-display mt-4 text-2xl font-bold">Payment didn’t go through</h1>
      <p className="mt-2 text-slate-600">
        No money was taken. Your booking is saved for 24 hours — try again or pay by bank transfer.
      </p>
      {tn && (
        <Button asChild size="lg" className="mt-6">
          <Link href={`/track/${tn}`}>Try again</Link>
        </Button>
      )}
    </div>
  );
}
