import { useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import type { CarrierType } from '@estene/contracts/enums';
import type { ManifestDto } from '@estene/contracts/manifest';
import { cn } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { officeOptions, useOffices } from '../offices/offices.queries';
import { useCreateManifest } from './manifests.queries';

/** Open a manifest between two offices. Carrier details can be finished before departure. */
export function CreateManifestDialog({
  fromOfficeId,
  toOfficeId,
  onClose,
  onCreated,
}: {
  fromOfficeId?: string;
  toOfficeId?: string;
  onClose: () => void;
  onCreated?: (m: ManifestDto) => void;
}) {
  const offices = useOffices();
  const create = useCreateManifest();
  const [from, setFrom] = useState(fromOfficeId ?? '');
  const [to, setTo] = useState(toOfficeId ?? '');
  const [carrierType, setCarrierType] = useState<CarrierType>('partner');
  const [f, setF] = useState({
    carrierName: '',
    waybillNumber: '',
    vehiclePlate: '',
    driverName: '',
    driverPhone: '',
  });
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const opts = officeOptions(offices.data);
  const blank = (v: string) => v.trim() || undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Open a manifest"
        description="A batch of parcels travelling between two offices."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From office">
              <Select
                placeholder="Choose"
                options={opts}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={!!fromOfficeId}
              />
            </Field>
            <Field label="To office">
              <Select
                placeholder="Choose"
                options={opts.filter((o) => o.value !== from)}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={!!toOfficeId}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Carrier">
            {(
              [
                { v: 'partner', t: 'Partner carrier', h: 'Bus or haulage company with a waybill' },
                { v: 'own_vehicle', t: 'Estene vehicle', h: 'Our van or truck and driver' },
              ] as const
            ).map((c) => (
              <button
                key={c.v}
                type="button"
                role="radio"
                aria-checked={carrierType === c.v}
                onClick={() => setCarrierType(c.v)}
                className={cn(
                  'rounded-lg border p-3 text-left',
                  carrierType === c.v ? 'border-primary bg-primary-soft' : 'hover:bg-muted',
                )}
              >
                <span className="block text-sm font-semibold">{c.t}</span>
                <span className="text-muted-foreground block text-xs">{c.h}</span>
              </button>
            ))}
          </div>
          {carrierType === 'partner' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Transport company">
                <Input
                  placeholder="e.g. GUO Transport"
                  value={f.carrierName}
                  onChange={set('carrierName')}
                />
              </Field>
              <Field label="Waybill number" hint="Can be added at the bus park, before departure.">
                <Input value={f.waybillNumber} onChange={set('waybillNumber')} />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Plate">
                <Input
                  className="uppercase"
                  value={f.vehiclePlate}
                  onChange={set('vehiclePlate')}
                />
              </Field>
              <Field label="Driver">
                <Input value={f.driverName} onChange={set('driverName')} />
              </Field>
              <Field label="Driver phone">
                <Input type="tel" value={f.driverPhone} onChange={set('driverPhone')} />
              </Field>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!from || !to || (carrierType === 'partner' && !f.carrierName.trim())}
              loading={create.isPending}
              onClick={() =>
                create.mutate(
                  {
                    fromOfficeId: from,
                    toOfficeId: to,
                    carrierType,
                    ...(carrierType === 'partner'
                      ? { carrierName: blank(f.carrierName), waybillNumber: blank(f.waybillNumber) }
                      : {
                          vehiclePlate: blank(f.vehiclePlate),
                          driverName: blank(f.driverName),
                          driverPhone: blank(f.driverPhone),
                        }),
                  },
                  {
                    onSuccess: (m) => {
                      toast.success(`Manifest ${m.code} opened`);
                      onCreated?.(m);
                      onClose();
                    },
                  },
                )
              }
            >
              Open manifest
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
