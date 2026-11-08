'use client';

import { useState, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { VEHICLE_TYPES, type VehicleType } from '@estene/contracts/enums';
import {
  RIDER_DOCUMENT_META,
  RiderApplicationInputSchema,
  type ApplicantKind,
} from '@estene/contracts/rider-application';
import { cn, humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Field } from '@estene/ui/Field';
import { Input, controlClass } from '@estene/ui/input';
import { Textarea } from '@estene/ui/textarea';
import { PublicApiError, publicApi, type PublicZone } from '@/lib/api';

type Draft = {
  kind: ApplicantKind;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  area: string;
  preferredZoneId: string;
  vehicleType: VehicleType;
  ownsVehicle: '' | 'yes' | 'no';
  plateNumber: string;
  yearsRiding: string;
  fleetName: string;
  fleetSize: string;
  notes: string;
  consent: boolean;
};

const EMPTY: Draft = {
  kind: 'rider',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  area: '',
  preferredZoneId: '',
  vehicleType: 'bike',
  ownsVehicle: '',
  plateNumber: '',
  yearsRiding: '',
  fleetName: '',
  fleetSize: '',
  notes: '',
  consent: false,
};

type Errors = Partial<Record<keyof Draft, string>>;

const toInput = (d: Draft) => ({
  kind: d.kind,
  firstName: d.firstName,
  lastName: d.lastName,
  phone: d.phone,
  email: d.email,
  area: d.area,
  preferredZoneId: d.preferredZoneId || undefined,
  vehicleType: d.vehicleType,
  ownsVehicle: d.ownsVehicle === '' ? undefined : d.ownsVehicle === 'yes',
  plateNumber: d.plateNumber,
  yearsRiding: d.yearsRiding === '' ? undefined : d.yearsRiding,
  fleetName: d.kind === 'fleet_owner' ? d.fleetName : undefined,
  fleetSize: d.kind === 'fleet_owner' && d.fleetSize !== '' ? d.fleetSize : undefined,
  notes: d.notes,
  consent: d.consent,
});

const VEHICLE_LABEL: Record<VehicleType, string> = {
  bike: 'Motorbike',
  tricycle: 'Tricycle (keke)',
  car: 'Car',
  van: 'Van',
};

export const DOCUMENTS_TO_BRING = Object.values(RIDER_DOCUMENT_META)
  .filter((m) => m.label !== 'Other')
  .map((m) => ({ label: m.label, required: m.required }));

export function RiderApplicationForm({ zones }: { zones: PublicZone[] }) {
  const [d, setD] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const result = RiderApplicationInputSchema.safeParse(toInput(d));
    if (!result.success) {
      const next: Errors = {};
      for (const issue of result.error.issues as z.core.$ZodIssue[]) {
        const k = issue.path[0] as keyof Draft;
        if (k && !next[k]) next[k] = issue.message;
      }
      setErrors(next);
      document.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await publicApi.applyToRide(result.data);
      setReference(res.reference);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof PublicApiError && err.fieldErrors) setErrors(err.fieldErrors as Errors);
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (reference)
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <CheckCircle2 className="text-success size-10" />
        <h2 className="font-display mt-4 text-2xl font-bold text-slate-900">
          Thanks, {d.firstName}. We’ve got your application.
        </h2>
        <p className="mt-2 text-slate-600">
          Your reference is <strong className="font-mono text-slate-900">{reference}</strong>. We’ve
          sent it to you by SMS. Someone from our team will call you on {d.phone} to book a vetting
          visit at one of our offices.
        </p>
        <h3 className="mt-6 font-semibold text-slate-900">Bring these to your vetting</h3>
        <DocumentList />
      </div>
    );

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8"
    >
      <fieldset>
        <legend className="text-sm font-medium text-slate-900">I’m applying as</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              ['rider', 'A rider', 'I’ll ride and deliver myself.'],
              ['fleet_owner', 'A fleet owner', 'I own vehicles and have riders.'],
            ] as const
          ).map(([value, title, body]) => (
            <Choice
              key={value}
              name="kind"
              checked={d.kind === value}
              onChange={() => set('kind', value)}
              title={title}
              body={body}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName}>
          <Input
            name="firstName"
            autoComplete="given-name"
            value={d.firstName}
            onChange={(e) => set('firstName', e.target.value)}
          />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <Input
            name="lastName"
            autoComplete="family-name"
            value={d.lastName}
            onChange={(e) => set('lastName', e.target.value)}
          />
        </Field>
        <Field label="Phone number" error={errors.phone} hint="We’ll call you on this number.">
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            value={d.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>
        <Field label="Email (optional)" error={errors.email}>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            value={d.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>
        <Field label="Where do you live?" error={errors.area} hint="Area or neighbourhood.">
          <Input
            name="area"
            placeholder="e.g. Nyanya"
            value={d.area}
            onChange={(e) => set('area', e.target.value)}
          />
        </Field>
        <Field label="Where would you like to ride?" error={errors.preferredZoneId}>
          <select
            name="preferredZoneId"
            className={cn(controlClass, 'h-10')}
            value={d.preferredZoneId}
            onChange={(e) => set('preferredZoneId', e.target.value)}
          >
            <option value="">Anywhere in Abuja</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={d.kind === 'fleet_owner' ? 'Main vehicle type' : 'Vehicle'}
          error={errors.vehicleType}
        >
          <select
            name="vehicleType"
            className={cn(controlClass, 'h-10')}
            value={d.vehicleType}
            onChange={(e) => set('vehicleType', e.target.value as VehicleType)}
          >
            {VEHICLE_TYPES.map((v) => (
              <option key={v} value={v}>
                {VEHICLE_LABEL[v] ?? humanize(v)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Years of riding or driving" error={errors.yearsRiding}>
          <Input
            name="yearsRiding"
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            value={d.yearsRiding}
            onChange={(e) => set('yearsRiding', e.target.value)}
          />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-slate-900">
            {d.kind === 'fleet_owner' ? 'Are the vehicles yours?' : 'Do you own the vehicle?'}
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Choice
              name="ownsVehicle"
              checked={d.ownsVehicle === 'yes'}
              onChange={() => set('ownsVehicle', 'yes')}
              title="Yes"
            />
            <Choice
              name="ownsVehicle"
              checked={d.ownsVehicle === 'no'}
              onChange={() => set('ownsVehicle', 'no')}
              title={d.kind === 'fleet_owner' ? 'No, I manage them' : 'No — I need one'}
            />
          </div>
          {errors.ownsVehicle && (
            <p className="text-destructive mt-1.5 text-xs">{errors.ownsVehicle}</p>
          )}
        </fieldset>
        {d.ownsVehicle === 'yes' && d.kind === 'rider' && (
          <Field label="Plate number (optional)" error={errors.plateNumber}>
            <Input
              name="plateNumber"
              value={d.plateNumber}
              onChange={(e) => set('plateNumber', e.target.value)}
            />
          </Field>
        )}
        {d.kind === 'fleet_owner' && (
          <>
            <Field label="Business name (optional)" error={errors.fleetName}>
              <Input
                name="fleetName"
                value={d.fleetName}
                onChange={(e) => set('fleetName', e.target.value)}
              />
            </Field>
            <Field label="How many vehicles?" error={errors.fleetSize}>
              <Input
                name="fleetSize"
                type="number"
                inputMode="numeric"
                min={1}
                value={d.fleetSize}
                onChange={(e) => set('fleetSize', e.target.value)}
              />
            </Field>
          </>
        )}
      </div>

      <Field label="Anything else we should know? (optional)" error={errors.notes}>
        <Textarea
          name="notes"
          rows={3}
          maxLength={500}
          value={d.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>

      <div>
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input
            name="consent"
            type="checkbox"
            className="accent-primary mt-0.5 size-4"
            checked={d.consent}
            onChange={(e) => set('consent', e.target.checked)}
          />
          Estene may call and text me about this application and keep the documents I bring to
          vetting.
        </label>
        {errors.consent && <p className="text-destructive mt-1.5 text-xs">{errors.consent}</p>}
      </div>

      {formError && (
        <p role="alert" className="bg-destructive-soft text-destructive rounded-lg p-3 text-sm">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" variant="accent" loading={busy} className="w-full sm:w-auto">
        Send application
      </Button>
    </form>
  );
}

export function DocumentList() {
  return (
    <ul className="mt-3 space-y-2 text-sm text-slate-700">
      {DOCUMENTS_TO_BRING.map((doc) => (
        <li key={doc.label} className="flex items-start gap-2">
          <CheckCircle2
            className={cn(
              'mt-0.5 size-4 shrink-0',
              doc.required ? 'text-primary' : 'text-slate-400',
            )}
          />
          <span>
            {doc.label}
            {!doc.required && <span className="text-slate-500"> — if you have one</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Choice({
  name,
  checked,
  onChange,
  title,
  body,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  body?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
        checked ? 'border-primary bg-primary-soft' : 'border-slate-200 hover:bg-slate-50',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="accent-primary mt-0.5 size-4"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        {body && <span className="mt-0.5 block text-sm text-slate-600">{body}</span>}
      </span>
    </label>
  );
}
