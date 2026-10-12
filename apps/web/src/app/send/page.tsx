import type { Metadata } from 'next';
import { BookingForm } from '@/components/booking/BookingForm';
import { publicApi } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Send a parcel',
  description: 'Get an instant delivery quote across Abuja and book a pickup in under a minute.',
};
export const revalidate = 300;

export default async function SendPage() {
  const [zones, offices] = await Promise.all([
    publicApi.zones().catch(() => []),
    publicApi.offices().catch(() => []),
  ]);
  return (
    <section className="bg-slate-50 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
          Send a parcel
        </h1>
        <p className="mt-2 text-slate-600">
          See your price as you go. Nothing is charged until the rider confirms your parcel.
        </p>
        {zones.length ? (
          <div className="mt-8">
            <BookingForm zones={zones} offices={offices} />
          </div>
        ) : (
          <p className="bg-warning-soft text-warning mt-8 rounded-xl p-5">
            Booking is temporarily unavailable. Please try again in a few minutes.
          </p>
        )}
      </div>
    </section>
  );
}
