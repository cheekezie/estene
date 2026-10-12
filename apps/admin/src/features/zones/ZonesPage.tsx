import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Map, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { formatNaira, koboToNaira, nairaToKobo } from '@estene/contracts/money';
import { ZoneInputSchema, type ZoneDto } from '@estene/contracts/zone';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { EmptyState } from '@estene/ui/EmptyState';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Textarea } from '@estene/ui/textarea';
import { PageHeader } from '@/shared/components/PageHeader';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { useSaveZone, useZones } from './zones.queries';

export default function ZonesPage() {
  const q = useZones();
  const can = useCan();
  const [editing, setEditing] = useState<ZoneDto | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Zones"
        description="Service areas riders are assigned to. Customers pick an area; the zone sets the fare."
        actions={can('ops_manager') && <Button onClick={() => setEditing('new')}><Plus />New zone</Button>}
      />
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {q.data?.length === 0 ? (
          <Card><EmptyState icon={Map} title="No zones yet" description="Create your first service zone to start taking bookings." /></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {q.data?.map((z) => (
              <Card key={z.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-blue-950 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-400">{z.code}</span>
                      <h3 className="font-semibold">{z.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{z.city} · {z.radiusKm} km radius</p>
                  </div>
                  {!z.isActive && <Badge>Paused</Badge>}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {z.areas.map((a) => <span key={a} className="rounded-md bg-muted px-2 py-0.5 text-xs">{a}</span>)}
                </div>
                <div className="mt-auto flex items-center justify-between border-t pt-3 mt-4">
                  <span className="text-sm"><span className="text-muted-foreground">In-zone fare </span><span className="tabular font-semibold">{formatNaira(z.intraZoneFare)}</span></span>
                  {can('ops_manager') && <Button variant="ghost" size="sm" onClick={() => setEditing(z)}><Pencil />Edit</Button>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {editing && <ZoneDialog zone={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Form works in naira and a comma list of areas; converted to the contract shape on submit. */
const ZoneFormSchema = ZoneInputSchema.omit({ intraZoneFare: true, areas: true, center: true }).extend({
  areasText: z.string().min(2, 'Add at least one area'),
  lat: z.coerce.number<string>().min(-90).max(90),
  lng: z.coerce.number<string>().min(-180).max(180),
  radiusKm: z.coerce.number<string>().positive().max(50),
  fareNaira: z.coerce.number<string>().min(0),
});

function ZoneDialog({ zone, onClose }: { zone: ZoneDto | null; onClose: () => void }) {
  const save = useSaveZone();
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(ZoneFormSchema),
    defaultValues: zone
      ? { name: zone.name, code: zone.code, city: zone.city, isActive: zone.isActive, areasText: zone.areas.join(', '), lat: String(zone.center.lat), lng: String(zone.center.lng), radiusKm: String(zone.radiusKm), fareNaira: String(koboToNaira(zone.intraZoneFare)) }
      : { city: 'Abuja', isActive: true, radiusKm: '4' },
  });

  const onSubmit = handleSubmit(({ areasText, lat, lng, fareNaira, ...rest }) => {
    const input = {
      ...rest,
      areas: areasText.split(',').map((a) => a.trim()).filter(Boolean),
      center: { lat, lng },
      intraZoneFare: nairaToKobo(fareNaira),
    };
    save.mutate({ id: zone?.id, input }, { onSuccess: () => { toast.success(zone ? 'Zone updated' : 'Zone created'); onClose(); } });
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={zone ? `Edit ${zone.name}` : 'New zone'}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" className="sm:col-span-2" error={errors.name?.message}><Input {...register('name')} /></Field>
            <Field label="Code" error={errors.code?.message} hint="2–4 letters"><Input className="uppercase" maxLength={4} {...register('code')} /></Field>
          </div>
          <Field label="Areas" error={errors.areasText?.message} hint="Comma-separated — these appear in the booking form.">
            <Textarea rows={2} {...register('areasText')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Centre latitude" error={errors.lat?.message}><Input inputMode="decimal" {...register('lat')} /></Field>
            <Field label="Centre longitude" error={errors.lng?.message}><Input inputMode="decimal" {...register('lng')} /></Field>
            <Field label="Radius (km)" error={errors.radiusKm?.message}><Input inputMode="decimal" {...register('radiusKm')} /></Field>
          </div>
          <Field label="In-zone fare (₦)" error={errors.fareNaira?.message} hint="Base fare when pickup and drop-off are both in this zone.">
            <Input inputMode="numeric" {...register('fareNaira')} />
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" {...register('isActive')} />Accepting bookings</label>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{zone ? 'Save changes' : 'Create zone'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
