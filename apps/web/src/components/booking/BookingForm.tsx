'use client';

import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  PARCEL_SIZES,
  PARCEL_SIZE_META,
  SERVICE_LEVELS,
  SERVICE_LEVEL_META,
  type PaymentMethod,
} from '@estene/contracts/enums';
import { formatNaira, nairaToKobo } from '@estene/contracts/money';
import type { QuoteLine } from '@estene/contracts/pricing';
import { cn, humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Field } from '@estene/ui/Field';
import { Input, controlClass } from '@estene/ui/input';
import { Textarea } from '@estene/ui/textarea';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { PublicApiError, publicApi, type PublicZone } from '@/lib/api';
import { TransferInstructions } from '@/components/TransferInstructions';
import type { TransactionDto } from '@estene/contracts/payment';
import {
  EMPTY_DRAFT,
  STEP_FIELDS,
  splitSlot,
  validate,
  type BookingDraft,
  type FieldErrors,
} from './booking-model';

const STEPS = ['Parcel & route', 'Contacts', 'Review'] as const;

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; hint: string; disabled?: boolean }[] =
  [
    { value: 'online', label: 'Pay online now', hint: 'Card, USSD or bank transfer' },
    { value: 'transfer', label: 'Bank transfer', hint: 'We give you an account number' },
    { value: 'cash_on_pickup', label: 'Pay the rider at pickup', hint: 'Cash when we collect' },
    {
      value: 'cash_on_delivery',
      label: 'Recipient pays on delivery',
      hint: 'Collected at hand-over',
    },
  ];

type Quote = { lines: QuoteLine[]; total: number };
type Booked = { trackingNumber: string; total: number; transfer?: TransactionDto };

export function BookingForm({ zones }: { zones: PublicZone[] }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<BookingDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);
  const quote = useLiveQuote(draft);

  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const next = () => {
    const { errors: stepErrors } = validate(draft, STEP_FIELDS[step]!);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const submit = async () => {
    const { data, errors: allErrors } = validate(draft, STEP_FIELDS.flat());
    if (!data) {
      setErrors(allErrors);
      setStep(
        Object.keys(allErrors).some((f) => STEP_FIELDS[0]!.includes(f as keyof BookingDraft))
          ? 0
          : 1,
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await publicApi.book(data);
      // Online: straight to the gateway's checkout; we come back to /pay/return afterwards.
      if (res.payment?.checkout) {
        window.location.assign(res.payment.checkout.checkoutUrl);
        return;
      }
      setBooked({
        trackingNumber: res.trackingNumber,
        total: res.estimate.total,
        transfer: res.payment?.transfer,
      });
      window.scrollTo({ top: 0 });
    } catch (err) {
      toast.error(err instanceof PublicApiError ? err.message : 'Could not complete your booking');
    } finally {
      setSubmitting(false);
    }
  };

  if (booked) return <BookingConfirmed {...booked} recipientPhone={draft.recipientPhone} />;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <Stepper step={step} />

        {step === 0 && (
          <div className="mt-8 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pickup area" error={errors.pickupSlot}>
                <AreaSelect
                  zones={zones}
                  value={draft.pickupSlot}
                  onChange={(v) => set('pickupSlot', v)}
                />
              </Field>
              <Field label="Drop-off area" error={errors.dropoffSlot}>
                <AreaSelect
                  zones={zones}
                  value={draft.dropoffSlot}
                  onChange={(v) => set('dropoffSlot', v)}
                />
              </Field>
            </div>

            <fieldset>
              <legend className="text-sm font-medium">Parcel size</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {PARCEL_SIZES.map((s) => (
                  <ChoiceCard
                    key={s}
                    selected={draft.size === s}
                    onSelect={() => set('size', s)}
                    title={PARCEL_SIZE_META[s].label}
                    hint={`up to ${PARCEL_SIZE_META[s].maxKg} kg`}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">{PARCEL_SIZE_META[draft.size].hint}</p>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Approximate weight (kg)" error={errors.weightKg}>
                <Input
                  inputMode="decimal"
                  value={draft.weightKg}
                  onChange={(e) => set('weightKg', e.target.value)}
                />
              </Field>
              <Field
                label="Value of contents (₦, optional)"
                error={errors.declaredValueNaira}
                hint="Adds goods protection to your delivery."
              >
                <Input
                  inputMode="numeric"
                  value={draft.declaredValueNaira}
                  onChange={(e) => set('declaredValueNaira', e.target.value.replace(/[^\d]/g, ''))}
                />
              </Field>
            </div>

            <Field label="What are you sending?" error={errors.description}>
              <Input
                placeholder="e.g. Documents, a pair of shoes, phone accessories"
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={draft.fragile}
                onChange={(e) => set('fragile', e.target.checked)}
              />
              Handle as fragile
            </label>

            <fieldset>
              <legend className="text-sm font-medium">Delivery speed</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {SERVICE_LEVELS.map((l) => (
                  <ChoiceCard
                    key={l}
                    selected={draft.serviceLevel === l}
                    onSelect={() => set('serviceLevel', l)}
                    title={SERVICE_LEVEL_META[l].label}
                    hint={SERVICE_LEVEL_META[l].hint}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div className="mt-8 space-y-8">
            <ContactBlock title="Pickup — you" area={splitSlot(draft.pickupSlot).area}>
              <Field label="Your name" error={errors.senderName}>
                <Input
                  autoComplete="name"
                  value={draft.senderName}
                  onChange={(e) => set('senderName', e.target.value)}
                />
              </Field>
              <Field label="Your phone" error={errors.senderPhone} hint="We text you every update.">
                <Input
                  type="tel"
                  autoComplete="tel"
                  placeholder="0803 123 4567"
                  value={draft.senderPhone}
                  onChange={(e) => set('senderPhone', e.target.value)}
                />
              </Field>
              <Field label="Pickup address" error={errors.pickupAddress} className="sm:col-span-2">
                <Input
                  autoComplete="street-address"
                  value={draft.pickupAddress}
                  onChange={(e) => set('pickupAddress', e.target.value)}
                />
              </Field>
              <Field
                label="Landmark (optional)"
                error={errors.pickupLandmark}
                className="sm:col-span-2"
              >
                <Input
                  placeholder="e.g. Opposite Banex Plaza"
                  value={draft.pickupLandmark}
                  onChange={(e) => set('pickupLandmark', e.target.value)}
                />
              </Field>
            </ContactBlock>
            <ContactBlock title="Drop-off — recipient" area={splitSlot(draft.dropoffSlot).area}>
              <Field label="Recipient's name" error={errors.recipientName}>
                <Input
                  value={draft.recipientName}
                  onChange={(e) => set('recipientName', e.target.value)}
                />
              </Field>
              <Field
                label="Recipient's phone"
                error={errors.recipientPhone}
                hint="Their delivery PIN is sent here."
              >
                <Input
                  type="tel"
                  placeholder="0803 123 4567"
                  value={draft.recipientPhone}
                  onChange={(e) => set('recipientPhone', e.target.value)}
                />
              </Field>
              <Field
                label="Drop-off address"
                error={errors.dropoffAddress}
                className="sm:col-span-2"
              >
                <Input
                  value={draft.dropoffAddress}
                  onChange={(e) => set('dropoffAddress', e.target.value)}
                />
              </Field>
              <Field
                label="Landmark (optional)"
                error={errors.dropoffLandmark}
                className="sm:col-span-2"
              >
                <Input
                  value={draft.dropoffLandmark}
                  onChange={(e) => set('dropoffLandmark', e.target.value)}
                />
              </Field>
            </ContactBlock>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email for receipt (optional)" error={errors.senderEmail}>
                <Input
                  type="email"
                  autoComplete="email"
                  value={draft.senderEmail}
                  onChange={(e) => set('senderEmail', e.target.value)}
                />
              </Field>
              <Field label="Note for the rider (optional)" error={errors.notes}>
                <Textarea
                  rows={1}
                  className="min-h-10"
                  value={draft.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-8 space-y-6">
            <Review draft={draft} />
            <fieldset>
              <legend className="text-sm font-medium">How will you pay?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {PAYMENT_OPTIONS.map((p) => (
                  <ChoiceCard
                    key={p.value}
                    selected={draft.paymentMethod === p.value}
                    disabled={p.disabled}
                    onSelect={() => set('paymentMethod', p.value)}
                    title={p.label}
                    hint={p.hint}
                  />
                ))}
              </div>
            </fieldset>
            <p className="bg-primary-soft flex items-start gap-2 rounded-xl p-4 text-sm text-blue-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              Your price is an estimate. The rider weighs and checks the parcel at pickup and you
              get an SMS if the price changes.
            </p>
          </div>
        )}

        <div className="mt-10 flex items-center justify-between border-t pt-6">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft />
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button size="lg" onClick={next}>
              Continue
              <ArrowRight />
            </Button>
          ) : (
            <Button size="lg" variant="accent" loading={submitting} onClick={submit}>
              Confirm booking
            </Button>
          )}
        </div>
      </div>

      <QuoteSummary quote={quote} />
    </div>
  );
}

/** Re-quotes from the API whenever the parcel or route changes. */
function useLiveQuote(d: BookingDraft) {
  // Debounce a string, not an object — a fresh object each render would never settle.
  const key = useDebounce(
    JSON.stringify([
      d.pickupSlot,
      d.dropoffSlot,
      d.size,
      d.weightKg,
      d.serviceLevel,
      d.fragile,
      d.declaredValueNaira,
    ]),
    400,
  );
  const [state, setState] = useState<{
    quote: Quote | null;
    loading: boolean;
    error: string | null;
  }>({ quote: null, loading: false, error: null });

  useEffect(() => {
    const [pickupSlot, dropoffSlot, size, weight, serviceLevel, fragile, value] = JSON.parse(
      key,
    ) as [
      string,
      string,
      BookingDraft['size'],
      string,
      BookingDraft['serviceLevel'],
      boolean,
      string,
    ];
    const pickup = splitSlot(pickupSlot);
    const dropoff = splitSlot(dropoffSlot);
    const weightKg = Number(weight);
    if (!pickup.zoneId || !dropoff.zoneId || !(weightKg > 0)) {
      setState({ quote: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    publicApi
      .quote({
        pickupZoneId: pickup.zoneId,
        dropoffZoneId: dropoff.zoneId,
        size,
        weightKg,
        serviceLevel,
        fragile,
        declaredValue: value ? nairaToKobo(Number(value)) : 0,
      })
      .then((quote) => !cancelled && setState({ quote, loading: false, error: null }))
      .catch(
        (err) =>
          !cancelled &&
          setState({
            quote: null,
            loading: false,
            error: err instanceof PublicApiError ? err.message : 'Could not get a price',
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}

function QuoteSummary({ quote }: { quote: ReturnType<typeof useLiveQuote> }) {
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-2xl bg-blue-950 p-6 text-white shadow-xl">
        <p className="text-sm text-blue-200">Estimated price</p>
        <p
          className="tabular font-display mt-1 flex items-center gap-3 text-4xl font-extrabold"
          aria-live="polite"
        >
          {quote.quote ? formatNaira(quote.quote.total) : '—'}
          {quote.loading && <Loader2 className="size-5 animate-spin text-blue-300" />}
        </p>
        {quote.error && <p className="mt-2 text-sm text-amber-300">{quote.error}</p>}
        {quote.quote ? (
          <ul className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
            {quote.quote.lines.map((l) => (
              <li key={l.code} className="flex justify-between gap-4">
                <span className="text-blue-200">{humanize(l.label)}</span>
                <span className="tabular">{formatNaira(l.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          !quote.error && (
            <p className="mt-3 text-sm text-blue-200">
              Choose pickup and drop-off areas to see your price.
            </p>
          )
        )}
      </div>
    </aside>
  );
}

/** Forwards id/aria props so the wrapping <Field> label and error are announced. */
function AreaSelect({
  zones,
  value,
  onChange,
  ...rest
}: { zones: PublicZone[]; value: string; onChange: (v: string) => void } & Omit<
  ComponentProps<'select'>,
  'value' | 'onChange'
>) {
  return (
    <select
      {...rest}
      className={cn(controlClass, 'h-11')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Select an area</option>
      {zones.map((z) => (
        <optgroup key={z.id} label={z.name}>
          {z.areas.map((a) => (
            <option key={a} value={`${z.id}|${a}`}>
              {a}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  hint,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        selected
          ? 'border-primary bg-primary-soft ring-primary ring-1'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
    </button>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
              i < step
                ? 'bg-primary text-white'
                : i === step
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-slate-100 text-slate-400',
            )}
          >
            {i + 1}
          </span>
          <span className={cn('hidden font-medium sm:inline', i > step && 'text-slate-400')}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <span className={cn('h-px flex-1', i < step ? 'bg-primary' : 'bg-slate-200')} />
          )}
        </li>
      ))}
    </ol>
  );
}

function ContactBlock({
  title,
  area,
  children,
}: {
  title: string;
  area: string;
  children: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="font-display flex items-baseline gap-2 text-lg font-bold">
        {title}
        <span className="text-sm font-normal text-slate-500">{area}</span>
      </legend>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Review({ draft }: { draft: BookingDraft }) {
  const p = splitSlot(draft.pickupSlot);
  const d = splitSlot(draft.dropoffSlot);
  return (
    <dl className="grid gap-5 rounded-xl border border-slate-200 p-5 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-slate-500">From</dt>
        <dd className="mt-1 font-medium">
          {draft.senderName} · {draft.senderPhone}
        </dd>
        <dd className="text-slate-600">
          {draft.pickupAddress}, {p.area}
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">To</dt>
        <dd className="mt-1 font-medium">
          {draft.recipientName} · {draft.recipientPhone}
        </dd>
        <dd className="text-slate-600">
          {draft.dropoffAddress}, {d.area}
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">Parcel</dt>
        <dd className="mt-1 font-medium">
          {PARCEL_SIZE_META[draft.size].label}, {draft.weightKg} kg{draft.fragile && ', fragile'}
        </dd>
        <dd className="text-slate-600">{draft.description}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Service</dt>
        <dd className="mt-1 font-medium">{SERVICE_LEVEL_META[draft.serviceLevel].label}</dd>
        <dd className="text-slate-600">{SERVICE_LEVEL_META[draft.serviceLevel].hint}</dd>
      </div>
    </dl>
  );
}

function BookingConfirmed({
  trackingNumber,
  total,
  recipientPhone,
  transfer,
}: Booked & { recipientPhone: string }) {
  const awaitingTransfer = !!transfer?.virtualAccount;
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <CheckCircle2 className="text-success mx-auto size-12" />
      <h2 className="font-display mt-4 text-2xl font-bold">
        {awaitingTransfer ? 'Booking saved — one last step' : 'Booking confirmed'}
      </h2>
      <p className="mt-2 text-slate-600">
        {awaitingTransfer
          ? 'Send the transfer below and we dispatch a rider the moment it lands.'
          : 'We are finding a rider near you. You will get an SMS when they are on the way.'}
      </p>
      {awaitingTransfer && (
        <div className="mt-6">
          <TransferInstructions amount={transfer!.amount} account={transfer!.virtualAccount!} />
        </div>
      )}
      <div className="mt-6 rounded-xl bg-slate-50 p-5">
        <p className="text-sm text-slate-500">Tracking number</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{trackingNumber}</p>
        <p className="mt-3 text-sm text-slate-500">
          Estimated price{' '}
          <span className="tabular font-semibold text-slate-900">{formatNaira(total)}</span>
        </p>
      </div>
      <p className="mt-5 text-sm text-slate-600">
        The recipient ({recipientPhone}) will get a delivery PIN by SMS when the parcel is out for
        delivery.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href={`/track/${trackingNumber}`}>Track this parcel</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="/send">Send another</a>
        </Button>
      </div>
    </div>
  );
}
