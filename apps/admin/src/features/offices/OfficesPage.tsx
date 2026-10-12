import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building, Clock, MapPin, Pencil, Phone, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { OfficeInputSchema, type OfficeDto } from '@estene/contracts/office';
import { formatPhone } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { EmptyState } from '@estene/ui/EmptyState';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { PageHeader } from '@/shared/components/PageHeader';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { AreaSelect } from '../shipments/components/AreaSelect';
import { useZones } from '../zones/zones.queries';
import { useOffices, useSaveOffice } from './offices.queries';

export default function OfficesPage() {
  const q = useOffices();
  const can = useCan();
  const [editing, setEditing] = useState<OfficeDto | 'new' | null>(null);
  const byCity = [...new Set((q.data ?? []).map((o) => o.zone.city))].map(
    (city) => [city, (q.data ?? []).filter((o) => o.zone.city === city)] as const,
  );

  return (
    <>
      <PageHeader
        title="Offices"
        description="Branches where senders drop off, parcels are consolidated for other states, and recipients collect."
        actions={
          can('ops_manager') && (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              New office
            </Button>
          )
        }
      />
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {q.data?.length === 0 ? (
          <Card>
            <EmptyState
              icon={Building}
              title="No offices yet"
              description="Add your first office to offer drop-off, collection and interstate delivery."
            />
          </Card>
        ) : (
          <div className="space-y-8">
            {byCity.map(([city, offices]) => (
              <section key={city}>
                <h2 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">
                  {city} · {offices[0]?.zone.state}
                </h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {offices.map((o) => (
                    <Card key={o.id} className="flex flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="rounded bg-blue-950 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-400">
                            {o.code}
                          </span>
                          <h3 className="mt-2 font-semibold">{o.name}</h3>
                        </div>
                        {!o.isActive && <Badge>Closed</Badge>}
                      </div>
                      <div className="text-muted-foreground mt-3 space-y-1.5 text-sm">
                        <p className="flex items-start gap-2">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" />
                          {o.address}, {o.area}
                        </p>
                        <p className="flex items-center gap-2">
                          <Phone className="size-3.5" />
                          {formatPhone(o.phone)}
                        </p>
                        <p className="flex items-center gap-2">
                          <Clock className="size-3.5" />
                          {o.openingHours}
                        </p>
                      </div>
                      {can('ops_manager') && (
                        <div className="mt-auto flex justify-end pt-4">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(o)}>
                            <Pencil />
                            Edit
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </QueryState>
      {editing && (
        <OfficeDialog
          office={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

type FormIn = z.input<typeof OfficeInputSchema>;
type FormOut = z.output<typeof OfficeInputSchema>;

function OfficeDialog({ office, onClose }: { office: OfficeDto | null; onClose: () => void }) {
  const zones = useZones();
  const save = useSaveOffice();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(OfficeInputSchema),
    defaultValues: office
      ? {
          name: office.name,
          code: office.code,
          zoneId: office.zone.id,
          area: office.area,
          address: office.address,
          landmark: office.landmark,
          phone: office.phone,
          openingHours: office.openingHours,
          isActive: office.isActive,
          location: office.location,
        }
      : { openingHours: 'Mon–Sat, 8am–6pm', isActive: true },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={office ? `Edit ${office.name}` : 'New office'}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((input) =>
            save.mutate(
              { id: office?.id, input },
              {
                onSuccess: () => {
                  toast.success(office ? 'Office updated' : 'Office created');
                  onClose();
                },
              },
            ),
          )}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" className="sm:col-span-2" error={errors.name?.message}>
              <Input placeholder="Wuse Office" {...register('name')} />
            </Field>
            <Field label="Code" error={errors.code?.message} hint="STATE-AREA">
              <Input className="uppercase" placeholder="ABJ-WSE" {...register('code')} />
            </Field>
          </div>
          <Field
            label="Area"
            error={errors.zoneId?.message || errors.area?.message ? 'Choose an area' : undefined}
          >
            <AreaSelect
              zones={zones.data ?? []}
              zoneId={watch('zoneId')}
              area={watch('area')}
              onChange={(z, a) => {
                setValue('zoneId', z);
                setValue('area', a);
              }}
            />
          </Field>
          <Field label="Street address" error={errors.address?.message}>
            <Input {...register('address')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" error={errors.phone?.message}>
              <Input type="tel" {...register('phone')} />
            </Field>
            <Field label="Opening hours">
              <Input {...register('openingHours')} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-primary size-4" {...register('isActive')} />
            Open for drop-off and collection
          </label>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {office ? 'Save' : 'Create office'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
