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
import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { TrackForm } from '@/components/TrackForm';
import { publicApi, type PublicZone } from '@/lib/api';

export const revalidate = 300;

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
        <HeroRoutes />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-blue-100 ring-1 ring-white/15">
              <span className="bg-accent size-1.5 rounded-full" /> Now delivering across Abuja
            </p>
            <h1 className="font-display mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Send it across Abuja. <span className="text-amber-400">Know where it is</span> every
              step.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-blue-100/90">
              Doorstep pickup, QR-tagged handling and PIN-secured delivery — from Wuse to Kubwa,
              Garki to Lugbe.
            </p>
            <div className="mt-8 max-w-xl">
              <TrackForm size="lg" />
            </div>
            <Link
              href="/send"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-amber-300"
            >
              Or get an instant quote <ArrowRight className="size-4" />
            </Link>
          </div>
          <ParcelCard />
        </div>
      </section>

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

/** Product preview: what a customer sees while their parcel moves. */
function ParcelCard() {
  const steps = ['created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const;
  const current = 3;
  return (
    <div
      className="relative mx-auto w-full max-w-sm rounded-2xl bg-white p-6 text-slate-900 shadow-2xl shadow-black/30"
      aria-hidden
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold">EST7K3M9Q2XA</span>
        <span className="bg-accent-soft rounded-full px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          {SHIPMENT_STATUS_META.out_for_delivery.label}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Wuse II → Garki II</p>
      <ol className="mt-6 space-y-4">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3">
            <span
              className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${i < current ? 'bg-primary text-white' : i === current ? 'bg-accent text-accent-foreground ring-4 ring-amber-100' : 'bg-slate-100 text-slate-400'}`}
            >
              {i < current ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={`text-sm ${i <= current ? 'font-medium' : 'text-slate-400'}`}>
              {SHIPMENT_STATUS_META[s].label}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <KeyRound className="text-primary size-4" />
        <span>Recipient PIN sent by SMS</span>
      </div>
    </div>
  );
}

function HeroRoutes() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden
    >
      <path
        d="M-20 520 C 200 420, 320 480, 520 360 S 860 160, 1220 120"
        stroke="var(--color-blue-700)"
        strokeWidth="2"
        strokeDasharray="6 10"
      />
      <path
        d="M-20 300 C 180 260, 300 140, 560 180 S 900 380, 1220 300"
        stroke="var(--color-blue-800)"
        strokeWidth="2"
      />
      <path
        d="M300 620 C 420 480, 600 460, 760 300"
        stroke="var(--color-amber-400)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="760" cy="300" r="6" fill="var(--color-amber-400)" />
    </svg>
  );
}
