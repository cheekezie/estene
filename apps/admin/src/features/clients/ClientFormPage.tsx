import type { ReactNode } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  CLIENT_INDUSTRIES,
  CLIENT_INDUSTRY_LABELS,
  ClientInputSchema,
  MONTHLY_VOLUMES,
  PAYMENT_TERMS_DAYS,
  type ClientDto,
  type ClientFormInput,
  type ClientInput,
} from '@estene/contracts/client';
import { koboToNaira, nairaToKobo } from '@estene/contracts/money';
import { humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Textarea } from '@estene/ui/textarea';
import { PageHeader } from '@/shared/components/PageHeader';
import { QueryState } from '@/shared/components/QueryState';
import { AreaSelect } from '../shipments/components/AreaSelect';
import { useZones } from '../zones/zones.queries';
import { useAccountManagers, useClient, useCreateClient, useUpdateClient } from './clients.queries';

/** What the form holds: the contract input, except the credit limit is typed in naira. */
type FormValues = ClientFormInput & { billing?: { creditLimitNaira?: string } };

/** Converts naira → kobo before the shared contract schema validates, so untouched values can't slip through unconverted. */
const resolver: Resolver<FormValues, unknown, ClientInput> = (values, ctx, opts) => {
  const { creditLimitNaira, ...billing } = values.billing ?? {};
  const prepared = {
    ...values,
    billing: {
      ...billing,
      creditLimit: creditLimitNaira ? nairaToKobo(Number(creditLimitNaira)) : undefined,
    },
  };
  return zodResolver(ClientInputSchema)(
    prepared as ClientFormInput,
    ctx,
    opts as never,
  ) as ReturnType<Resolver<FormValues, unknown, ClientInput>>;
};

const toFormValues = (c: ClientDto): FormValues => ({
  name: c.name,
  legalName: c.legalName,
  industry: c.industry,
  rcNumber: c.rcNumber,
  website: c.website,
  contact: { ...c.contact },
  address: {
    line: c.address.line,
    zoneId: c.address.zoneId,
    area: c.address.area,
    landmark: c.address.landmark,
    city: c.address.city,
    state: c.address.state,
  },
  billing: {
    email: c.billing.email,
    paymentTermsDays: c.billing.paymentTermsDays as (typeof PAYMENT_TERMS_DAYS)[number],
    creditLimitNaira: c.billing.creditLimit ? String(koboToNaira(c.billing.creditLimit)) : '',
  },
  expectedMonthlyVolume: c.expectedMonthlyVolume,
  accountManagerId: c.accountManager?.id,
  notes: c.notes,
});

const blankToUndefined = { setValueAs: (v: string) => (v === '' ? undefined : v) };

export default function ClientFormPage() {
  const { id } = useParams();
  const existing = useClient(id ?? '');
  if (!id) return <ClientForm />;
  return (
    <QueryState isLoading={existing.isLoading} error={existing.error}>
      {existing.data && <ClientForm client={existing.data} />}
    </QueryState>
  );
}

function ClientForm({ client }: { client?: ClientDto }) {
  const navigate = useNavigate();
  const zones = useZones();
  const managers = useAccountManagers();
  const create = useCreateClient();
  const update = useUpdateClient(client?.id ?? '');

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues, unknown, ClientInput>({
    resolver,
    defaultValues: client
      ? toFormValues(client)
      : { address: { city: 'Abuja', state: 'FCT' }, billing: { paymentTermsDays: 0 } },
  });
  const [zoneId, area] = useWatch({ control, name: ['address.zoneId', 'address.area'] });

  const onSubmit = handleSubmit((input) => {
    const done = (c: ClientDto) => {
      toast.success(client ? 'Client updated' : 'Client created');
      navigate(`/clients/${c.id}`);
    };
    if (client) update.mutate(input, { onSuccess: done });
    else create.mutate(input, { onSuccess: done });
  });

  const back = client ? `/clients/${client.id}` : '/clients';

  return (
    <>
      <Link
        to={back}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> {client ? client.name : 'Business clients'}
      </Link>
      <PageHeader
        title={client ? `Edit ${client.name}` : 'New business client'}
        description="Businesses can book by phone, be billed on account, and integrate through the API."
      />

      <form onSubmit={onSubmit} noValidate className="max-w-4xl space-y-6">
        <Section title="Business">
          <Field label="Trading name" error={errors.name?.message}>
            <Input {...register('name')} />
          </Field>
          <Field label="Registered (legal) name" hint="As on CAC documents, if different.">
            <Input {...register('legalName', blankToUndefined)} />
          </Field>
          <Field label="Industry" error={errors.industry?.message}>
            <Select
              placeholder="Select industry"
              options={CLIENT_INDUSTRIES.map((i) => ({
                value: i,
                label: CLIENT_INDUSTRY_LABELS[i],
              }))}
              {...register('industry')}
            />
          </Field>
          <Field label="CAC number (optional)" hint="RC or BN number.">
            <Input placeholder="RC 1234567" {...register('rcNumber', blankToUndefined)} />
          </Field>
          <Field label="Website (optional)" error={errors.website?.message}>
            <Input type="url" placeholder="https://" {...register('website', blankToUndefined)} />
          </Field>
          <Field label="Expected shipments / month" hint="Helps us plan rider capacity.">
            <Select
              placeholder="Not sure yet"
              options={MONTHLY_VOLUMES.map((v) => ({ value: v, label: v }))}
              {...register('expectedMonthlyVolume', blankToUndefined)}
            />
          </Field>
        </Section>

        <Section title="Primary contact">
          <Field label="Full name" error={errors.contact?.name?.message}>
            <Input autoComplete="off" {...register('contact.name')} />
          </Field>
          <Field label="Role (optional)">
            <Input
              placeholder="e.g. Operations manager"
              {...register('contact.role', blankToUndefined)}
            />
          </Field>
          <Field label="Phone" error={errors.contact?.phone?.message}>
            <Input type="tel" {...register('contact.phone')} />
          </Field>
          <Field label="Email" error={errors.contact?.email?.message}>
            <Input type="email" {...register('contact.email')} />
          </Field>
        </Section>

        <Section
          title="Business address"
          hint="Also the default pickup when staff book for this client."
        >
          <Field label="Area" hint="Sets the pickup zone.">
            <AreaSelect
              zones={zones.data ?? []}
              zoneId={zoneId}
              area={area}
              onChange={(z, a) => {
                setValue('address.zoneId', z || undefined);
                setValue('address.area', a || undefined);
              }}
            />
          </Field>
          <Field label="Landmark (optional)">
            <Input {...register('address.landmark', blankToUndefined)} />
          </Field>
          <Field
            label="Street address"
            className="sm:col-span-2"
            error={errors.address?.line?.message}
          >
            <Input {...register('address.line')} />
          </Field>
          <Field label="City" error={errors.address?.city?.message}>
            <Input {...register('address.city')} />
          </Field>
          <Field label="State" error={errors.address?.state?.message}>
            <Input {...register('address.state')} />
          </Field>
        </Section>

        <Section title="Billing & account">
          <Field
            label="Billing email (optional)"
            hint="Invoices go here; defaults to the contact."
            error={errors.billing?.email?.message}
          >
            <Input type="email" {...register('billing.email', blankToUndefined)} />
          </Field>
          <Field label="Payment terms" hint="For on-account shipments.">
            <Select
              options={PAYMENT_TERMS_DAYS.map((d) => ({
                value: String(d),
                label: d === 0 ? 'Pay per shipment' : `Net ${d} days`,
              }))}
              {...register('billing.paymentTermsDays', { setValueAs: (v) => Number(v) })}
            />
          </Field>
          <Field
            label="Credit limit (₦, optional)"
            hint="Unpaid on-account balance allowed. Blank = no limit."
            error={errors.billing?.creditLimit?.message}
          >
            <Input inputMode="numeric" {...register('billing.creditLimitNaira')} />
          </Field>
          <Field label="Account manager (optional)">
            <Select
              placeholder="Unassigned"
              options={(managers.data ?? []).map((m) => ({
                value: m.id,
                label: `${m.name} — ${humanize(m.role)}`,
              }))}
              {...register('accountManagerId', blankToUndefined)}
            />
          </Field>
          <Field label="Notes (optional)" className="sm:col-span-2">
            <Textarea rows={3} {...register('notes', blankToUndefined)} />
          </Field>
        </Section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={back}>Cancel</Link>
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {client ? 'Save changes' : 'Create client'}
          </Button>
        </div>
      </form>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}
