import { useEffect, useState } from 'react';
import { useForm, useWatch, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Building2, Loader2, Phone, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  PARCEL_SIZES,
  PARCEL_SIZE_META,
  PAYMENT_METHOD_LABELS,
  SERVICE_LEVELS,
  SERVICE_LEVEL_META,
  type PaymentMethod,
} from '@estene/contracts/enums';
import { formatNaira, nairaToKobo } from '@estene/contracts/money';
import { AdminCreateShipmentSchema, type ShipmentDto } from '@estene/contracts/shipment';
import type { ZoneDto } from '@estene/contracts/zone';
import type { QuoteLine } from '@estene/contracts/pricing';
import { NigerianPhoneSchema } from '@estene/contracts/common';
import { cn, humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Textarea } from '@estene/ui/textarea';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { api } from '@/lib/api';
import { PageHeader } from '@/shared/components/PageHeader';
import { useClientOptions } from '../clients/clients.queries';
import { useZones } from '../zones/zones.queries';
import { AreaSelect } from './components/AreaSelect';

type FormIn = z.input<typeof AdminCreateShipmentSchema>;
type FormOut = z.output<typeof AdminCreateShipmentSchema>;
type Form = UseFormReturn<FormIn, unknown, FormOut>;

/** Staff can't take card payments over the phone; businesses can also be invoiced. */
const PAYMENT_OPTIONS: Record<'individual' | 'client', PaymentMethod[]> = {
  individual: ['cash_on_pickup', 'cash_on_delivery', 'transfer'],
  client: ['on_account', 'cash_on_pickup', 'cash_on_delivery'],
};

type SenderLookup = {
  contactName: string;
  zoneId: string;
  area: string;
  address: string;
  landmark?: string;
  senderEmail?: string;
} | null;

export default function NewShipmentPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetClient = params.get('clientId') ?? undefined;
  const zones = useZones();
  const clients = useClientOptions();

  const form: Form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(AdminCreateShipmentSchema),
    defaultValues: {
      clientId: presetClient,
      serviceLevel: 'standard',
      paymentMethod: presetClient ? 'on_account' : 'cash_on_pickup',
      parcel: { size: 'small', weightKg: 1, fragile: false },
    },
  });
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = form;
  const clientId = useWatch({ control, name: 'clientId' });
  const paymentMethod = useWatch({ control, name: 'paymentMethod' });
  const paymentChoices = PAYMENT_OPTIONS[clientId ? 'client' : 'individual'];

  // Keep the payment method valid for the chosen customer type.
  useEffect(() => {
    if (!paymentChoices.includes(paymentMethod as PaymentMethod))
      setValue('paymentMethod', paymentChoices[0]!);
  }, [clientId]);

  // Booking for a business: pickup defaults to their address and contact (staff can still edit).
  const selectedClient = clients.data?.find((c) => c.id === clientId);
  useEffect(() => {
    if (!selectedClient) return;
    const p = selectedClient.pickup;
    setValue('pickup.contactName', `${selectedClient.name} (${p.contactName})`);
    setValue('pickup.phone', p.phone);
    setValue('pickup.address', p.address);
    if (p.zoneId && p.area) {
      setValue('pickup.zoneId', p.zoneId);
      setValue('pickup.area', p.area);
    }
    setValue('pickup.landmark', p.landmark);
  }, [selectedClient?.id]);

  const book = useMutation({
    mutationFn: (body: FormOut) => api.post<ShipmentDto>('/shipments', body),
    onSuccess: (shipment) => {
      toast.success(`Booked ${shipment.trackingNumber}`, {
        description:
          'Dispatch is finding a rider. The sender gets an SMS with the tracking number.',
      });
      navigate(`/shipments/${shipment.id}`);
    },
  });

  return (
    <>
      <Link
        to="/shipments"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Shipments
      </Link>
      <PageHeader
        title="New shipment"
        description="Key in a booking taken over the phone or for a business client."
      />

      <form
        onSubmit={handleSubmit((v) => book.mutate(v))}
        noValidate
        className="grid gap-6 xl:grid-cols-[1fr_340px]"
      >
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="grid gap-3 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Customer type"
              >
                <TypeCard
                  icon={UserRound}
                  title="Individual"
                  hint="Walk-in or phone customer"
                  selected={!clientId}
                  onSelect={() => setValue('clientId', undefined)}
                />
                <TypeCard
                  icon={Building2}
                  title="Business client"
                  hint="Book on their account"
                  selected={!!clientId}
                  onSelect={() => setValue('clientId', clients.data?.[0]?.id)}
                  disabled={!clients.data?.length}
                />
              </div>
              {clientId !== undefined && (
                <Field label="Business" className="mt-4">
                  <Select
                    options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                    {...register('clientId')}
                  />
                </Field>
              )}
            </CardContent>
          </Card>

          <StopSection
            form={form}
            prefix="pickup"
            title="Pickup (sender)"
            zones={zones.data ?? []}
            lookup
          />
          <StopSection
            form={form}
            prefix="dropoff"
            title="Drop-off (recipient)"
            zones={zones.data ?? []}
          />

          <Card>
            <CardHeader>
              <CardTitle>Parcel</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-4">
              <Field label="Size" className="sm:col-span-2">
                <Select
                  options={PARCEL_SIZES.map((s) => ({
                    value: s,
                    label: `${PARCEL_SIZE_META[s].label} — ${PARCEL_SIZE_META[s].hint}`,
                  }))}
                  {...register('parcel.size')}
                />
              </Field>
              <Field label="Weight (kg)" error={errors.parcel?.weightKg?.message}>
                <Input
                  inputMode="decimal"
                  {...register('parcel.weightKg', {
                    setValueAs: (v) => (v === '' ? undefined : Number(v)),
                  })}
                />
              </Field>
              <Field label="Value (₦, optional)" error={errors.parcel?.declaredValue?.message}>
                <Input
                  inputMode="numeric"
                  {...register('parcel.declaredValue', {
                    setValueAs: (v) => (v ? nairaToKobo(Number(v)) : 0),
                  })}
                />
              </Field>
              <Field
                label="Contents"
                className="sm:col-span-3"
                error={errors.parcel?.description?.message}
              >
                <Input placeholder="What's in the parcel?" {...register('parcel.description')} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  {...register('parcel.fragile')}
                />
                Fragile
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service & payment</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Service">
                <Select
                  options={SERVICE_LEVELS.map((l) => ({
                    value: l,
                    label: `${SERVICE_LEVEL_META[l].label} — ${SERVICE_LEVEL_META[l].hint}`,
                  }))}
                  {...register('serviceLevel')}
                />
              </Field>
              <Field label="Payment" error={errors.paymentMethod?.message}>
                <Select
                  options={paymentChoices.map((p) => ({
                    value: p,
                    label: PAYMENT_METHOD_LABELS[p],
                  }))}
                  {...register('paymentMethod')}
                />
              </Field>
              <Field
                label="Sender email for receipt (optional)"
                error={errors.senderEmail?.message}
              >
                <Input
                  type="email"
                  {...register('senderEmail', { setValueAs: (v: string) => v || undefined })}
                />
              </Field>
              <Field label="Note for the rider (optional)">
                <Textarea
                  rows={1}
                  className="min-h-10"
                  {...register('notes', { setValueAs: (v: string) => v || undefined })}
                />
              </Field>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <LiveQuote control={control} />
          <Button type="submit" size="lg" className="w-full" loading={book.isPending}>
            Book shipment
          </Button>
          <FormErrorSummary errors={errors} />
        </aside>
      </form>
    </>
  );
}

function StopSection({
  form,
  prefix,
  title,
  zones,
  lookup,
}: {
  form: Form;
  prefix: 'pickup' | 'dropoff';
  title: string;
  zones: ZoneDto[];
  lookup?: boolean;
}) {
  const {
    register,
    setValue,
    control,
    getValues,
    formState: { errors },
  } = form;
  const e = errors[prefix];
  const zoneId = useWatch({ control, name: `${prefix}.zoneId` });
  const area = useWatch({ control, name: `${prefix}.area` });
  const [looking, setLooking] = useState(false);

  /** Returning caller? Fill their details from the last booking — only into empty fields. */
  const lookupCaller = async (raw: string) => {
    const phone = NigerianPhoneSchema.safeParse(raw);
    if (!lookup || !phone.success || getValues('pickup.address')) return;
    setLooking(true);
    try {
      const found = await api.get<SenderLookup>('/shipments/lookup-sender', { phone: phone.data });
      if (!found) return;
      if (!getValues('pickup.contactName')) setValue('pickup.contactName', found.contactName);
      setValue('pickup.zoneId', found.zoneId);
      setValue('pickup.area', found.area);
      setValue('pickup.address', found.address);
      if (found.landmark) setValue('pickup.landmark', found.landmark);
      if (found.senderEmail && !getValues('senderEmail'))
        setValue('senderEmail', found.senderEmail);
      toast.info('Returning customer — filled from their last booking');
    } catch {
      // Lookup is a convenience; never block the booking on it.
    } finally {
      setLooking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {looking && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone"
          error={e?.phone?.message}
          hint={
            lookup ? 'Enter first — we look up returning callers.' : 'Delivery PIN is sent here.'
          }
        >
          <div className="relative">
            <Phone className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              type="tel"
              className="pl-9"
              placeholder="0803 123 4567"
              {...register(`${prefix}.phone`, { onBlur: (ev) => lookupCaller(ev.target.value) })}
            />
          </div>
        </Field>
        <Field label="Name" error={e?.contactName?.message}>
          <Input {...register(`${prefix}.contactName`)} />
        </Field>
        <Field
          label="Area"
          error={e?.zoneId?.message || e?.area?.message ? 'Choose an area' : undefined}
        >
          <AreaSelect
            zones={zones}
            zoneId={zoneId}
            area={area}
            onChange={(z, a) => {
              setValue(`${prefix}.zoneId`, z, { shouldValidate: !!e });
              setValue(`${prefix}.area`, a, { shouldValidate: !!e });
            }}
          />
        </Field>
        <Field label="Landmark (optional)">
          <Input
            {...register(`${prefix}.landmark`, { setValueAs: (v: string) => v || undefined })}
          />
        </Field>
        <Field label="Address" className="sm:col-span-2" error={e?.address?.message}>
          <Input {...register(`${prefix}.address`)} />
        </Field>
      </CardContent>
    </Card>
  );
}

function LiveQuote({ control }: { control: Form['control'] }) {
  const [pickupZoneId, dropoffZoneId, size, weightKg, serviceLevel, fragile, declaredValue] =
    useWatch({
      control,
      name: [
        'pickup.zoneId',
        'dropoff.zoneId',
        'parcel.size',
        'parcel.weightKg',
        'serviceLevel',
        'parcel.fragile',
        'parcel.declaredValue',
      ],
    });
  const key = useDebounce(
    JSON.stringify({
      pickupZoneId,
      dropoffZoneId,
      size,
      weightKg,
      serviceLevel,
      fragile,
      declaredValue,
    }),
    350,
  );
  const input = JSON.parse(key) as Record<string, unknown>;
  const ready = !!input.pickupZoneId && !!input.dropoffZoneId && Number(input.weightKg) > 0;

  const q = useQuery({
    queryKey: ['shipments', 'quote', key],
    queryFn: () => api.post<{ lines: QuoteLine[]; total: number }>('/shipments/quote', input),
    enabled: ready,
    staleTime: 60_000,
    retry: false,
  });

  return (
    <Card className="bg-blue-950 text-white">
      <CardContent className="py-5">
        <p className="text-sm text-blue-200">Quote for the caller</p>
        <p className="tabular font-display mt-1 flex items-center gap-2 text-3xl font-extrabold">
          {ready && q.data ? formatNaira(q.data.total) : '—'}
          {q.isFetching && <Loader2 className="size-4 animate-spin text-blue-300" />}
        </p>
        {!ready && <p className="mt-2 text-sm text-blue-200">Pick both areas to price the trip.</p>}
        {q.error && <p className="mt-2 text-sm text-amber-300">{q.error.message}</p>}
        {ready && q.data && (
          <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-sm">
            {q.data.lines.map((l) => (
              <li key={l.code} className="flex justify-between">
                <span className="text-blue-200">{humanize(l.label)}</span>
                <span className="tabular">{formatNaira(l.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-blue-300">
          Estimate — the rider confirms size and weight at pickup.
        </p>
      </CardContent>
    </Card>
  );
}

function TypeCard({
  icon: Icon,
  title,
  hint,
  selected,
  onSelect,
  disabled,
}: {
  icon: typeof UserRound;
  title: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-50',
        selected ? 'border-primary bg-primary-soft' : 'hover:bg-muted',
      )}
    >
      <Icon className={cn('size-5', selected ? 'text-primary' : 'text-muted-foreground')} />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground block text-xs">
          {disabled ? 'No business clients yet' : hint}
        </span>
      </span>
    </button>
  );
}

/** On a long form, say *where* the problems are next to the submit button. */
function FormErrorSummary({ errors }: { errors: FieldErrors<FormIn> }) {
  const sections = [
    errors.pickup && 'pickup',
    errors.dropoff && 'drop-off',
    errors.parcel && 'parcel',
    (errors.paymentMethod || errors.senderEmail) && 'payment',
  ].filter(Boolean);
  if (!sections.length) return null;
  return (
    <p className="bg-destructive-soft text-destructive rounded-md p-3 text-sm" role="alert">
      Check the {sections.join(', ')} details.
    </p>
  );
}
