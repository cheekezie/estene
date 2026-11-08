import type { Metadata } from 'next';
import { DocumentList, RiderApplicationForm } from '@/components/RiderApplicationForm';
import { publicApi } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Ride with Estene',
  description:
    'Apply to deliver with Estene in Abuja — as a rider or a fleet owner. Steady jobs near you and weekly payouts.',
};
export const revalidate = 300;

const STEPS = [
  ['Apply', 'Fill in this form. It takes two minutes.'],
  ['We call you', 'Our team calls to book a vetting visit at one of our offices.'],
  ['Vetting', 'Bring your documents. We check them and your vehicle, and answer your questions.'],
  ['Start riding', 'Install the Estene Rider app, go online and take jobs near you.'],
] as const;

export default async function RidePage() {
  const zones = await publicApi.zones().catch(() => []);
  return (
    <section className="bg-slate-50 py-10 sm:py-14">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">
            Ride with Estene
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
            Apply to ride
          </h1>
          <p className="mt-3 text-slate-600">
            For riders and fleet owners in Abuja. Get jobs in the areas you cover, keep your
            earnings minus a clear commission, and get paid weekly.
          </p>
          <ol className="mt-8 space-y-5">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold text-slate-900">{title}</span>
                  <span className="text-sm text-slate-600">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">What to bring to vetting</h2>
            <DocumentList />
          </div>
        </div>
        <RiderApplicationForm zones={zones} />
      </div>
    </section>
  );
}
