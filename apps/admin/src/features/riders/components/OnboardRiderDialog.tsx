import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy } from 'lucide-react';
import { z } from 'zod';
import { RIDER_TYPES, VEHICLE_TYPES } from '@estene/contracts/enums';
import { RiderInputSchema } from '@estene/contracts/rider';
import { cn, humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { useZones, zoneOptions } from '../../zones/zones.queries';
import { useCreateRider } from '../riders.queries';

type FormIn = z.input<typeof RiderInputSchema>;
type FormOut = z.output<typeof RiderInputSchema>;

const TYPE_COPY = {
  company: { title: 'Company rider', body: 'On payroll, rides an Estene vehicle. Full fare is Estene revenue.' },
  partner: { title: 'Partner rider', body: 'Independent or fleet-owned. Keeps the fare minus our commission.' },
} as const;

export function OnboardRiderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const zones = useZones();
  const create = useCreateRider();
  const [created, setCreated] = useState<{ name: string; phone: string; tempPassword: string } | null>(null);

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(RiderInputSchema),
    defaultValues: { type: 'company', vehicleType: 'bike', coverageZoneIds: [] },
  });
  const { register, handleSubmit, setValue, formState: { errors } } = form;
  const type = useWatch({ control: form.control, name: 'type' });
  const primaryZoneId = useWatch({ control: form.control, name: 'primaryZoneId' });
  const coverage = useWatch({ control: form.control, name: 'coverageZoneIds' }) ?? [];

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      form.reset();
      setCreated(null);
    }
  };

  const onSubmit = handleSubmit((input) => {
    const payload = input.type === 'company' ? { ...input, commissionPct: undefined, fleetName: undefined } : input;
    create.mutate(payload, {
      onSuccess: ({ rider, tempPassword }) => setCreated({ name: `${rider.firstName} ${rider.lastName}`, phone: rider.phone, tempPassword }),
    });
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={created ? 'Rider onboarded' : 'Onboard a rider'} className="max-w-2xl">
        {created ? (
          <CreatedNotice {...created} onDone={() => close(false)} />
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Rider type">
              {RIDER_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setValue('type', t)}
                  className={cn('rounded-lg border p-4 text-left transition-colors', type === t ? 'border-primary bg-primary-soft' : 'hover:bg-muted')}
                >
                  <p className="text-sm font-semibold">{TYPE_COPY[t].title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{TYPE_COPY[t].body}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" error={errors.firstName?.message}><Input {...register('firstName')} /></Field>
              <Field label="Last name" error={errors.lastName?.message}><Input {...register('lastName')} /></Field>
              <Field label="Phone" error={errors.phone?.message} hint="Used to sign in to the rider app."><Input type="tel" placeholder="0803 123 4567" {...register('phone')} /></Field>
              <Field label="Email (optional)" error={errors.email?.message}>
                <Input type="email" {...register('email', { setValueAs: (v: string) => v || undefined })} />
              </Field>
              <Field label="Vehicle" error={errors.vehicleType?.message}>
                <Select options={VEHICLE_TYPES.map((v) => ({ value: v, label: humanize(v) }))} {...register('vehicleType')} />
              </Field>
              <Field label="Plate number (optional)">
                <Input {...register('plateNumber', { setValueAs: (v: string) => v || undefined })} />
              </Field>
              {type === 'partner' && (
                <>
                  <Field label="Fleet / company (optional)"><Input {...register('fleetName', { setValueAs: (v: string) => v || undefined })} /></Field>
                  <Field label="Commission % (optional)" error={errors.commissionPct?.message} hint="Blank uses the platform default.">
                    <Input type="number" min={0} max={100} step={0.5} {...register('commissionPct', { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) })} />
                  </Field>
                </>
              )}
            </div>

            <Field label="Primary zone" error={errors.primaryZoneId?.message} hint="Riders get first priority for jobs in their primary zone.">
              <Select placeholder="Select a zone" options={zoneOptions(zones.data)} {...register('primaryZoneId')} />
            </Field>

            <fieldset>
              <legend className="text-sm font-medium">Also covers</legend>
              <p className="mb-2 text-xs text-muted-foreground">Second-priority zones for this rider.</p>
              <div className="flex flex-wrap gap-2">
                {zones.data?.filter((z) => z.id !== primaryZoneId).map((z) => {
                  const on = coverage.includes(z.id);
                  return (
                    <button
                      key={z.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setValue('coverageZoneIds', on ? coverage.filter((c) => c !== z.id) : [...coverage, z.id])}
                      className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
                    >
                      {z.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" loading={create.isPending}>Onboard rider</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreatedNotice({ name, phone, tempPassword, onDone }: { name: string; phone: string; tempPassword: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <strong>{name}</strong> is onboarded in <strong>pending</strong> status. Share these sign-in details, then activate them from their profile once documents are verified.
      </p>
      <div className="rounded-lg border bg-muted p-4 text-sm">
        <p><span className="text-muted-foreground">Phone:</span> {phone}</p>
        <p className="mt-1 flex items-center gap-2">
          <span className="text-muted-foreground">Temporary password:</span>
          <code className="rounded bg-card px-2 py-0.5 font-mono font-semibold">{tempPassword}</code>
          <button
            type="button"
            className="rounded p-1 hover:bg-card"
            aria-label="Copy password"
            onClick={() => navigator.clipboard.writeText(tempPassword).then(() => setCopied(true))}
          >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          </button>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">This password is shown once and is not stored in readable form.</p>
      <div className="flex justify-end"><Button onClick={onDone}>Done</Button></div>
    </div>
  );
}
