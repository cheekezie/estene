import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { RIDER_TYPES, VEHICLE_TYPES } from '@estene/contracts/enums';
import { RiderInputSchema } from '@estene/contracts/rider';
import type { RiderApplicationDto } from '@estene/contracts/rider-application';
import { cn, formatPhone, humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { CreatedNotice } from '../../riders/components/OnboardRiderDialog';
import { useZones, zoneOptions } from '../../zones/zones.queries';
import { useApproveApplication } from '../rider-applications.queries';

type FormIn = z.input<typeof RiderInputSchema>;
type FormOut = z.output<typeof RiderInputSchema>;

const TYPE_COPY = {
  company: {
    title: 'Company rider',
    body: 'Rides an Estene vehicle. Full fare is Estene revenue.',
  },
  partner: {
    title: 'Partner rider',
    body: 'Own or fleet vehicle. Keeps the fare minus commission.',
  },
} as const;

/** Approving creates the rider account, active straight away, pre-filled from the application. */
export function ApproveDialog({
  application: a,
  open,
  onOpenChange,
}: {
  application: RiderApplicationDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const zones = useZones();
  const approve = useApproveApplication(a.id);
  const [created, setCreated] = useState<{ phone: string; tempPassword: string } | null>(null);

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(RiderInputSchema),
    defaultValues: {
      firstName: a.firstName,
      lastName: a.lastName,
      phone: a.phone,
      email: a.email,
      type: a.ownsVehicle || a.kind === 'fleet_owner' ? 'partner' : 'company',
      vehicleType: a.vehicleType,
      plateNumber: a.plateNumber,
      primaryZoneId: a.preferredZone?.id,
      coverageZoneIds: [],
      fleetName: a.fleetName,
    },
  });
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = form;
  const type = useWatch({ control: form.control, name: 'type' });
  const primaryZoneId = useWatch({ control: form.control, name: 'primaryZoneId' });
  const coverage = useWatch({ control: form.control, name: 'coverageZoneIds' }) ?? [];

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setCreated(null);
  };

  const onSubmit = handleSubmit((input) => {
    const payload =
      input.type === 'company'
        ? { ...input, commissionPct: undefined, fleetName: undefined }
        : input;
    approve.mutate(payload, {
      onSuccess: ({ rider, tempPassword }) => {
        toast.success(`Rider ${rider.code} created`);
        setCreated({ phone: rider.phone, tempPassword });
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={created ? 'Rider approved' : `Approve ${a.firstName} ${a.lastName}`}
        description={
          created
            ? undefined
            : 'Creates their rider account, active straight away. Check the details.'
        }
        className="max-w-2xl"
      >
        {created ? (
          <CreatedNotice
            name={`${a.firstName} ${a.lastName}`}
            phone={formatPhone(created.phone)}
            tempPassword={created.tempPassword}
            onDone={() => close(false)}
            intro={
              <>
                <strong>
                  {a.firstName} {a.lastName}
                </strong>{' '}
                is now an active rider and has been sent an SMS to install the app. Give them these
                sign-in details before they leave the office.
              </>
            }
          />
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
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    type === t ? 'border-primary bg-primary-soft' : 'hover:bg-muted',
                  )}
                >
                  <p className="text-sm font-semibold">{TYPE_COPY[t].title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{TYPE_COPY[t].body}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" error={errors.firstName?.message}>
                <Input {...register('firstName')} />
              </Field>
              <Field label="Last name" error={errors.lastName?.message}>
                <Input {...register('lastName')} />
              </Field>
              <Field label="Phone" error={errors.phone?.message} hint="They sign in with this.">
                <Input type="tel" {...register('phone')} />
              </Field>
              <Field label="Vehicle" error={errors.vehicleType?.message}>
                <Select
                  options={VEHICLE_TYPES.map((v) => ({ value: v, label: humanize(v) }))}
                  {...register('vehicleType')}
                />
              </Field>
              <Field label="Plate number (optional)">
                <Input
                  {...register('plateNumber', { setValueAs: (v: string) => v || undefined })}
                />
              </Field>
              {type === 'partner' && (
                <>
                  <Field label="Fleet / company (optional)">
                    <Input
                      {...register('fleetName', { setValueAs: (v: string) => v || undefined })}
                    />
                  </Field>
                  <Field
                    label="Commission % (optional)"
                    error={errors.commissionPct?.message}
                    hint="Blank uses the platform default."
                  >
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      {...register('commissionPct', {
                        setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                      })}
                    />
                  </Field>
                </>
              )}
            </div>

            <Field
              label="Primary zone"
              error={errors.primaryZoneId?.message}
              hint="They get first priority for jobs here."
            >
              <Select
                placeholder="Select a zone"
                options={zoneOptions(zones.data)}
                {...register('primaryZoneId')}
              />
            </Field>

            <fieldset>
              <legend className="text-sm font-medium">Also covers</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {zones.data
                  ?.filter((z) => z.id !== primaryZoneId)
                  .map((z) => {
                    const on = coverage.includes(z.id);
                    return (
                      <button
                        key={z.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setValue(
                            'coverageZoneIds',
                            on ? coverage.filter((c) => c !== z.id) : [...coverage, z.id],
                          )
                        }
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'hover:bg-muted',
                        )}
                      >
                        {z.name}
                      </button>
                    );
                  })}
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={approve.isPending}>
                Approve and create rider
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
