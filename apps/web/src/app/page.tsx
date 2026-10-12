import Link from 'next/link';
import {
  ArrowRight,
  Bike,
  Check,
  KeyRound,
  MapPin,
  PackageCheck,
  QrCode,
  Timer,
  Truck,
} from 'lucide-react';
import { SERVICE_LEVELS, SERVICE_LEVEL_META } from '@estene/contracts/enums';
import { AreaTicker } from '@/components/hero/AreaTicker';
import { LiveCityMap } from '@/components/hero/LiveCityMap';
import { RotatingWord } from '@/components/hero/RotatingWord';
import { TrackForm } from '@/components/TrackForm';
import { publicApi, type PublicZone } from '@/lib/api';

export const revalidate = 300;

const FALLBACK_AREAS = [
  'Wuse II',
  'Garki',
  'Maitama',
  'Asokoro',
  'Jabi',
  'Utako',
  'Gwarinpa',
  'Kubwa',
  'Lugbe',
  'Apo',
  'Nyanya',
];

const STEPS = [
  {
    icon: PackageCheck,
    title: 'Book in a minute',
    body: 'Pick the areas, describe the parcel and see your price before you confirm.',
  },
  {
    icon: Bike,
    title: 'A nearby rider collects',
    body: 'The closest rider who covers your area is assigned automatically.',
  },
  {
    icon: QrCode,
    title: 'Tagged and tracked',
    body: 'Your parcel gets a unique QR tag at pickup. Every scan updates you by SMS.',
  },
  {
    icon: KeyRound,
    title: 'Handed to the right person',
    body: 'The recipient gets a delivery PIN. No PIN, no handover.',
  },
];

const SERVICE_ICON = { standard: Truck, express: Timer, same_day: PackageCheck } as const;

async function loadZones(): Promise<PublicZone[]> {
  try {
    return await publicApi.zones();
  } catch {
    return []; // the page still renders if the API is briefly unavailable
  }
}

export default async function HomePage() {
  const zones = await loadZones();

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-blue-950 text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-blue-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 size-[420px] rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pb-28 md:pt-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-blue-100 ring-1 ring-white/15">
              <span className="bg-accent size-1.5 rounded-full" /> Now delivering across Abuja
            </p>
            <h1 className="font-display mt-5 text-[2.6rem] font-extrabold leading-[1.15] tracking-tight sm:text-6xl lg:text-[4.2rem]">
              Send <RotatingWord words={['documents', 'gifts', 'orders', 'anything']} />
              <br />
              across Abuja.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-blue-100/90">
              A rider at your door in minutes. Every parcel QR-tagged, tracked live, and handed over
              only with the recipient’s PIN.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/send"
                className="bg-accent text-accent-foreground hover:bg-accent-hover inline-flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold shadow-lg shadow-amber-500/20 transition-transform hover:-translate-y-0.5"
              >
                Send a parcel <ArrowRight className="size-5" />
              </Link>
              <Link
                href="#track"
                className="inline-flex items-center justify-center rounded-xl px-6 py-4 text-base font-semibold text-white ring-1 ring-white/25 hover:bg-white/10"
              >
                Track a parcel
              </Link>
            </div>
            <div id="track" className="mt-8 max-w-xl scroll-mt-24">
              <TrackForm />
            </div>
          </div>
          <LiveCityMap />
        </div>
      </section>

      <AreaTicker areas={zones.length ? zones.flatMap((z) => z.areas) : FALLBACK_AREAS} />

      {/* Trust strip */}
      <section className="border-b bg-white">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 text-sm text-slate-600 sm:grid-cols-3 sm:px-6">
          {[
            'QR tag on every parcel',
            'SMS at every milestone',
            'PIN or photo proof of delivery',
          ].map((t) => (
            <p key={t} className="flex items-center gap-2">
              <Check className="text-primary size-4" />
              {t}
            </p>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle eyebrow="How it works" title="From your door to theirs, accounted for" />
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                className="relative rounded-2xl border border-slate-200 bg-slate-50/60 p-6"
              >
                <span className="font-display absolute right-6 top-6 text-sm font-bold text-slate-300">
                  0{i + 1}
                </span>
                <div className="bg-primary grid size-11 place-items-center rounded-xl text-white">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-display mt-5 text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Services */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle eyebrow="Services" title="Pick the speed you need" />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {SERVICE_LEVELS.map((level) => {
              const Icon = SERVICE_ICON[level];
              const featured = level === 'express';
              return (
                <div
                  key={level}
                  className={`rounded-2xl p-7 ${featured ? 'bg-primary text-white shadow-xl shadow-blue-900/20' : 'border border-slate-200 bg-white'}`}
                >
                  <Icon className={`size-6 ${featured ? 'text-amber-300' : 'text-primary'}`} />
                  <h3 className="font-display mt-4 text-xl font-bold">
                    {SERVICE_LEVEL_META[level].label}
                  </h3>
                  <p className={`mt-2 text-sm ${featured ? 'text-blue-100' : 'text-slate-600'}`}>
                    {SERVICE_LEVEL_META[level].hint}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-sm text-slate-500">
            Prices depend on route, parcel size and weight. You see the estimate before you book;
            the rider confirms it at pickup.
          </p>
        </div>
      </section>

      {/* Coverage */}
      {zones.length > 0 && (
        <section id="coverage" className="scroll-mt-20 bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle eyebrow="Coverage" title="Where we deliver today" />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {zones.map((z) => (
                <div key={z.id} className="rounded-xl border border-slate-200 p-5">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    <MapPin className="text-primary size-4" />
                    {z.name}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{z.areas.join(' · ')}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Riders */}
      <section id="riders" className="scroll-mt-20 bg-blue-950 py-20 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
              Ride with Estene
            </p>
            <h2 className="font-display mt-3 text-3xl font-bold sm:text-4xl">
              Own a bike or a fleet? Get steady jobs in your area.
            </h2>
            <p className="mt-4 text-blue-100/90">
              Partner riders and fleet owners get jobs in the zones they cover, keep their earnings
              minus a transparent commission, and run their own vehicles.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              'Jobs near you first',
              'Weekly payouts',
              'Your fleet, your rules',
              'In-app scan & proof',
            ].map((t) => (
              <li
                key={t}
                className="flex items-center gap-3 rounded-xl bg-white/5 p-4 ring-1 ring-white/10"
              >
                <Check className="size-5 text-amber-400" />
                {t}
              </li>
            ))}
            <li className="sm:col-span-2">
              <a
                href="mailto:riders@estene.ng?subject=Partner%20rider%20application"
                className="bg-accent text-accent-foreground hover:bg-accent-hover inline-flex items-center gap-2 rounded-lg px-5 py-3 font-semibold"
              >
                Apply to ride <ArrowRight className="size-4" />
              </a>
            </li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white py-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
            Ready to send?
          </h2>
          <p className="mt-3 text-slate-600">
            Get a price in seconds. Pay on pickup, on delivery, or by card.
          </p>
          <Link
            href="/send"
            className="bg-primary hover:bg-primary-hover mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-900/20"
          >
            Send a parcel <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-primary text-sm font-semibold uppercase tracking-wider">{eyebrow}</p>
      <h2 className="font-display mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}
