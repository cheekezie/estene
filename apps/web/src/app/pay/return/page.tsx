import type { Metadata } from 'next';
import { PaymentResult } from './PaymentResult';

export const metadata: Metadata = { title: 'Payment', robots: { index: false } };

type Props = { searchParams: Promise<{ ref?: string }> };

/** Where the gateway sends shoppers back. The result is always re-checked server-side, never trusted from the URL. */
export default async function PaymentReturnPage({ searchParams }: Props) {
  const { ref } = await searchParams;
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-lg px-4 sm:px-6">
        <PaymentResult reference={ref ?? ''} />
      </div>
    </section>
  );
}
