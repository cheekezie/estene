import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  PARCEL_SIZES,
  PARCEL_SIZE_META,
  SERVICE_LEVELS,
  SERVICE_LEVEL_META,
  type ParcelSize,
  type ServiceLevel,
} from '@estene/contracts/enums';
import { formatNaira, koboToNaira, nairaToKobo } from '@estene/contracts/money';
import { computeQuote, type PricingConfig } from '@estene/contracts/pricing';
import { humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { useZones, zoneOptions } from '../zones/zones.queries';
import {
  useDeleteRouteRate,
  usePricingConfig,
  useRouteRates,
  useSavePricing,
  useSaveRouteRate,
  type PlatformSettings,
} from './pricing.queries';

/** Every money field is edited in naira and stored in kobo. */
type FormValues = {
  defaultRouteFare: string;
  interstateFare: string;
  sizeFees: Record<ParcelSize, string>;
  includedKg: string;
  perKgFee: string;
  serviceMultipliers: Record<ServiceLevel, string>;
  fragileFee: string;
  insuranceRatePct: string;
  minInsuranceFee: string;
  roundToNaira: string;
  partnerCommissionPct: string;
  maxActiveJobsPerRider: string;
};

const mapRecord = <K extends string, A, B>(r: Record<K, A>, fn: (v: A) => B) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fn(v as A)])) as Record<K, B>;

const toForm = (s: PlatformSettings): FormValues => ({
  defaultRouteFare: String(koboToNaira(s.defaultRouteFare)),
  interstateFare: String(koboToNaira(s.interstateFare ?? 450_000)),
  sizeFees: mapRecord(s.sizeFees, (v) => String(koboToNaira(v))),
  includedKg: String(s.includedKg),
  perKgFee: String(koboToNaira(s.perKgFee)),
  serviceMultipliers: mapRecord(s.serviceMultipliers, String),
  fragileFee: String(koboToNaira(s.fragileFee)),
  insuranceRatePct: String(s.insuranceRatePct),
  minInsuranceFee: String(koboToNaira(s.minInsuranceFee)),
  roundToNaira: String(s.roundToNaira),
  partnerCommissionPct: String(s.partnerCommissionPct),
  maxActiveJobsPerRider: String(s.maxActiveJobsPerRider),
});

const fromForm = (f: FormValues): Omit<PlatformSettings, 'version'> => ({
  defaultRouteFare: nairaToKobo(Number(f.defaultRouteFare)),
  interstateFare: nairaToKobo(Number(f.interstateFare)),
  sizeFees: mapRecord(f.sizeFees, (v) => nairaToKobo(Number(v))),
  includedKg: Number(f.includedKg),
  perKgFee: nairaToKobo(Number(f.perKgFee)),
  serviceMultipliers: mapRecord(f.serviceMultipliers, Number),
  fragileFee: nairaToKobo(Number(f.fragileFee)),
  insuranceRatePct: Number(f.insuranceRatePct),
  minInsuranceFee: nairaToKobo(Number(f.minInsuranceFee)),
  roundToNaira: Number(f.roundToNaira),
  partnerCommissionPct: Number(f.partnerCommissionPct),
  maxActiveJobsPerRider: Number(f.maxActiveJobsPerRider),
});

export default function PricingPage() {
  const config = usePricingConfig();
  return (
    <>
      <PageHeader
        title="Pricing"
        description="Every customer price is an estimate from these rules. Riders confirm the final price at pickup."
      />
      <QueryState isLoading={config.isLoading} error={config.error} onRetry={config.refetch}>
        {config.data && <PricingForm key={config.data.version} settings={config.data} />}
      </QueryState>
      <div className="mt-6">
        <RouteFares />
      </div>
    </>
  );
}

function PricingForm({ settings }: { settings: PlatformSettings }) {
  const can = useCan();
  const editable = can('ops_manager', 'finance');
  const save = useSavePricing();
  const { register, handleSubmit, control, formState } = useForm<FormValues>({
    defaultValues: toForm(settings),
  });
  const values = useWatch({ control }) as FormValues;

  const money = (name: Parameters<typeof register>[0]) => (
    <Input inputMode="numeric" disabled={!editable} {...register(name, { required: true })} />
  );

  return (
    <form
      onSubmit={handleSubmit((f) =>
        save.mutate(fromForm(f), {
          onSuccess: () => toast.success('Pricing saved — new quotes use it immediately'),
        }),
      )}
    >
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Base fares</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Default route fare (₦)"
                hint="Used between zones with no specific route fare."
              >
                {money('defaultRouteFare')}
              </Field>
              <Field
                label="Default interstate fare (₦)"
                hint="Between states with no specific route fare, e.g. Abuja ↔ Lagos."
              >
                {money('interstateFare')}
              </Field>
              <Field label="Round prices up to nearest (₦)">{money('roundToNaira')}</Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parcel size & weight</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-5">
                {PARCEL_SIZES.map((s) => (
                  <Field
                    key={s}
                    label={PARCEL_SIZE_META[s].label}
                    hint={`≤ ${PARCEL_SIZE_META[s].maxKg} kg`}
                  >
                    {money(`sizeFees.${s}`)}
                  </Field>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Weight included (kg)">{money('includedKg')}</Field>
                <Field label="Each extra kg (₦)">{money('perKgFee')}</Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service & add-ons</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {SERVICE_LEVELS.map((l) => (
                  <Field
                    key={l}
                    label={`${SERVICE_LEVEL_META[l].label} ×`}
                    hint={SERVICE_LEVEL_META[l].hint}
                  >
                    {money(`serviceMultipliers.${l}`)}
                  </Field>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Fragile handling (₦)">{money('fragileFee')}</Field>
                <Field label="Goods protection (%)" hint="Of declared value">
                  {money('insuranceRatePct')}
                </Field>
                <Field label="Minimum protection fee (₦)">{money('minInsuranceFee')}</Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rider network</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Partner commission (%)"
                hint="Default cut of partner riders' trips. Override per rider."
              >
                {money('partnerCommissionPct')}
              </Field>
              <Field
                label="Max jobs per rider"
                hint="Dispatch skips riders already carrying this many."
              >
                {money('maxActiveJobsPerRider')}
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <QuotePreview values={values} />
          {editable && (
            <Button
              type="submit"
              className="w-full"
              disabled={!formState.isDirty}
              loading={save.isPending}
            >
              Save pricing
            </Button>
          )}
          <p className="text-muted-foreground text-center text-xs">
            Version {settings.version}. Existing shipments keep the price they were quoted.
          </p>
        </div>
      </div>
    </form>
  );
}

/** Runs the exact same `computeQuote` the API uses, against the unsaved form values. */
function QuotePreview({ values }: { values: FormValues }) {
  const [size, setSize] = useState<ParcelSize>('small');
  const [level, setLevel] = useState<ServiceLevel>('standard');
  const [weight, setWeight] = useState('2');

  const quote = useMemo(() => {
    try {
      const cfg = fromForm(values) as PricingConfig;
      return computeQuote(
        {
          routeFare: cfg.defaultRouteFare,
          size,
          weightKg: Number(weight) || 0,
          serviceLevel: level,
          fragile: false,
          declaredValue: 0,
        },
        cfg,
      );
    } catch {
      return null;
    }
  }, [values, size, level, weight]);

  return (
    <Card className="bg-primary-soft/40 border-blue-200">
      <CardHeader>
        <CardTitle>Preview a quote</CardTitle>
        <span className="text-muted-foreground text-xs">Default route</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Size"
            value={size}
            onChange={(e) => setSize(e.target.value as ParcelSize)}
            options={PARCEL_SIZES.map((s) => ({ value: s, label: PARCEL_SIZE_META[s].label }))}
          />
          <Select
            aria-label="Service"
            value={level}
            onChange={(e) => setLevel(e.target.value as ServiceLevel)}
            options={SERVICE_LEVELS.map((s) => ({ value: s, label: SERVICE_LEVEL_META[s].label }))}
          />
        </div>
        <Field label="Weight (kg)">
          <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        {quote && (
          <div className="space-y-1.5 border-t pt-3 text-sm">
            {quote.lines.map((l) => (
              <div key={l.code} className="flex justify-between">
                <span className="text-muted-foreground">{humanize(l.label)}</span>
                <span className="tabular">{formatNaira(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Customer pays</span>
              <span className="tabular">{formatNaira(quote.total)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RouteFares() {
  const zones = useZones();
  const rates = useRouteRates();
  const saveRate = useSaveRouteRate();
  const deleteRate = useDeleteRouteRate();
  const can = useCan();
  const [draft, setDraft] = useState({ a: '', b: '', fare: '' });

  const add = () =>
    saveRate.mutate(
      { originZoneId: draft.a, destinationZoneId: draft.b, fare: nairaToKobo(Number(draft.fare)) },
      {
        onSuccess: () => {
          toast.success('Route fare saved');
          setDraft({ a: '', b: '', fare: '' });
        },
      },
    );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Route fares</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            Zone-to-zone base fares. Applies both directions.
          </p>
        </div>
      </CardHeader>
      {can('ops_manager', 'finance') && (
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <Field label="From" className="min-w-48 flex-1">
            <Select
              placeholder="Zone"
              options={zoneOptions(zones.data)}
              value={draft.a}
              onChange={(e) => setDraft({ ...draft, a: e.target.value })}
            />
          </Field>
          <Field label="To" className="min-w-48 flex-1">
            <Select
              placeholder="Zone"
              options={zoneOptions(zones.data)}
              value={draft.b}
              onChange={(e) => setDraft({ ...draft, b: e.target.value })}
            />
          </Field>
          <Field label="Fare (₦)" className="w-32">
            <Input
              inputMode="numeric"
              value={draft.fare}
              onChange={(e) => setDraft({ ...draft, fare: e.target.value })}
            />
          </Field>
          <Button
            onClick={add}
            disabled={!draft.a || !draft.b || !draft.fare || draft.a === draft.b}
            loading={saveRate.isPending}
          >
            Save fare
          </Button>
        </div>
      )}
      <QueryState isLoading={rates.isLoading} error={rates.error} rows={3}>
        <Table>
          <THead>
            <TR>
              <TH>Route</TH>
              <TH className="text-right">Fare</TH>
              <TH className="w-12" />
            </TR>
          </THead>
          <TBody>
            {rates.data?.map((r) => (
              <TR key={r.id}>
                <TD>
                  {r.zoneA.name} <span className="text-muted-foreground">↔</span> {r.zoneB.name}
                </TD>
                <TD className="tabular text-right font-medium">{formatNaira(r.fare)}</TD>
                <TD>
                  {can('ops_manager', 'finance') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove route fare"
                      onClick={() => deleteRate.mutate(r.id)}
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </QueryState>
    </Card>
  );
}
