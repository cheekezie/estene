import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, PackageX } from 'lucide-react';
import { SERVICE_LEVEL_META, type ShipmentStatus } from '@estene/contracts/enums';
import { SHIPMENT_STATUS_META, TRACKING_MILESTONES } from '@estene/contracts/shipment-status';
import type { PublicTrackingDto } from '@estene/contracts/shipment';
import { formatDateTime } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { ShipmentStatusBadge } from '@estene/ui/ShipmentStatusBadge';
import { BalanceDue } from '@/components/BalanceDue';
import { TrackForm } from '@/components/TrackForm';
import { PublicApiError, publicApi } from '@/lib/api';

type Props = { params: Promise<{ trackingNumber: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { trackingNumber } = await params;
  return { title: `Tracking ${trackingNumber.toUpperCase()}`, robots: { index: false } };
}

export default async function TrackingResultPage({ params }: Props) {
  const { trackingNumber } = await params;
  const tn = decodeURIComponent(trackingNumber).toUpperCase();

  let parcel: PublicTrackingDto | null = null;
  let error: string | null = null;
  try {
    parcel = await publicApi.track(tn);
  } catch (err) {
    error = err instanceof PublicApiError ? err.message : 'Something went wrong';
  }

  return (
    <>
      <section className="bg-blue-950 py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <TrackForm defaultValue={tn} />
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {parcel ? (
          <TrackingResult parcel={parcel} />
        ) : (
          <div className="flex flex-col items-center py-12 text-center">
            <PackageX className="size-10 text-slate-400" />
            <h1 className="font-display mt-4 text-xl font-bold text-slate-900">{error}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Check the number in your SMS — it looks like{' '}
              <span className="font-mono">EST7K3M9Q2XA</span>.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function TrackingResult({ parcel }: { parcel: PublicTrackingDto }) {
  const meta = SHIPMENT_STATUS_META[parcel.status];
  const reached = new Map<ShipmentStatus, string>();
  parcel.events.forEach((e) => reached.set(e.status, e.at));
  // Unpaid bookings are explained by the payment card instead of the generic help note.
  const offPath =
    !TRACKING_MILESTONES.includes(parcel.status) && parcel.status !== 'awaiting_payment';
  const currentIdx = Math.max(...TRACKING_MILESTONES.map((m, i) => (reached.has(m) ? i : -1)));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-slate-500">{parcel.trackingNumber}</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-slate-900">{meta.label}</h1>
          <p className="mt-2 text-slate-600">{meta.description}</p>
        </div>
        <ShipmentStatusBadge status={parcel.status} className="text-sm" />
      </div>

      {parcel.payment && <BalanceDue trackingNumber={parcel.trackingNumber} due={parcel.payment} />}

      <dl className="grid gap-4 rounded-2xl border border-slate-200 p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">From</dt>
          <dd className="mt-0.5 font-medium">{parcel.pickupArea}</dd>
        </div>
        <div>
          <dt className="text-slate-500">To</dt>
          <dd className="mt-0.5 font-medium">{parcel.dropoffArea}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Service</dt>
          <dd className="mt-0.5 font-medium">{SERVICE_LEVEL_META[parcel.serviceLevel].label}</dd>
        </div>
        {parcel.riderFirstName && (
          <div>
            <dt className="text-slate-500">Rider</dt>
            <dd className="mt-0.5 font-medium">{parcel.riderFirstName}</dd>
          </div>
        )}
      </dl>

      <ol className="space-y-0" aria-label="Delivery progress">
        {TRACKING_MILESTONES.map((m, i) => {
          const at = reached.get(m);
          const done = i <= currentIdx;
          const active = i === currentIdx && !offPath && parcel.status !== 'delivered';
          return (
            <li key={m} className="relative flex gap-4 pb-8 last:pb-0">
              {i < TRACKING_MILESTONES.length - 1 && (
                <span
                  className={cn(
                    'absolute left-[15px] top-8 h-[calc(100%-24px)] w-0.5',
                    i < currentIdx ? 'bg-primary' : 'bg-slate-200',
                  )}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  'relative grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold',
                  active
                    ? 'bg-accent text-accent-foreground ring-4 ring-amber-100'
                    : done
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-400',
                )}
              >
                {done && !active ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="pt-1">
                <p className={cn('font-medium', !done && 'text-slate-400')}>
                  {SHIPMENT_STATUS_META[m].label}
                </p>
                {at && <p className="text-sm text-slate-500">{formatDateTime(at)}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {offPath && (
        <p className="bg-warning-soft text-warning rounded-xl p-4 text-sm">
          {meta.description} Need help? Email{' '}
          <a className="underline" href={`mailto:hello@estene.ng?subject=${parcel.trackingNumber}`}>
            hello@estene.ng
          </a>
          .
        </p>
      )}

      <p className="text-center text-sm text-slate-500">
        Want to send one too?{' '}
        <Link href="/send" className="text-primary font-medium hover:underline">
          Get a quote
        </Link>
      </p>
    </div>
  );
}
