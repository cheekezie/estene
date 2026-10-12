import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Camera, KeyRound, MapPin, Phone, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { PARCEL_SIZE_META, SERVICE_LEVEL_META } from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import { isTerminal } from '@estene/contracts/order-status';
import type { StopDto } from '@estene/contracts/order';
import { formatDateTime } from '@estene/lib/date';
import { formatPhone, humanize } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { OrderStatusBadge } from '@estene/ui/OrderStatusBadge';
import { QueryState } from '@/shared/components/QueryState';
import { ReasonDialog } from '@/shared/components/ReasonDialog';
import { useCan } from '@/shared/hooks/useCan';
import { AssignRiderDialog } from './components/AssignRiderDialog';
import { OrderTimeline } from './components/OrderTimeline';
import { useCancelOrder, useMarkPaid, useOrder, useUnassignRider } from './orders.queries';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const q = useOrder(id);
  const can = useCan();
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancel = useCancelOrder(id);
  const unassign = useUnassignRider(id);
  const markPaid = useMarkPaid(id);
  const o = q.data;

  return (
    <>
      <Link to="/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {o && (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-mono text-2xl font-bold tracking-tight">{o.trackingNumber}</h1>
                  <OrderStatusBadge status={o.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Booked {formatDateTime(o.createdAt)} · {SERVICE_LEVEL_META[o.serviceLevel].label}</p>
              </div>
              {can('ops_manager', 'dispatcher') && !isTerminal(o.status) && (
                <div className="flex flex-wrap gap-2">
                  {o.status === 'created' && <Button onClick={() => setAssignOpen(true)}>Assign rider</Button>}
                  {(o.status === 'assigned' || o.status === 'en_route_to_pickup') && (
                    <Button variant="outline" loading={unassign.isPending} onClick={() => unassign.mutate('Reassigned by ops', { onSuccess: () => toast.success('Rider removed — back in dispatch') })}>
                      Remove rider
                    </Button>
                  )}
                  {['created', 'assigned', 'en_route_to_pickup'].includes(o.status) && (
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setCancelOpen(true)}
                    >
                      Cancel order
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <StopCard title="Pickup" stop={o.pickup} />
                  <StopCard title="Drop-off" stop={o.dropoff} />
                </div>

                <Card>
                  <CardHeader><CardTitle>Parcel</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 text-sm sm:grid-cols-4">
                    <Detail label="Size">{PARCEL_SIZE_META[o.parcel.size].label}</Detail>
                    <Detail label="Weight">{o.parcel.weightKg} kg</Detail>
                    <Detail label="Fragile">{o.parcel.fragile ? 'Yes' : 'No'}</Detail>
                    <Detail label="Declared value">{o.parcel.declaredValue ? formatNaira(o.parcel.declaredValue) : '—'}</Detail>
                    <Detail label="Contents" className="sm:col-span-4">{o.parcel.description}</Detail>
                    {o.tagCode && (
                      <Detail label="QR tag" className="sm:col-span-2">
                        <span className="inline-flex items-center gap-1.5 font-mono"><QrCode className="size-4 text-primary" />{o.tagCode}</span>
                      </Detail>
                    )}
                    {o.proof && (
                      <Detail label="Proof of delivery" className="sm:col-span-2">
                        <span className="inline-flex items-center gap-1.5">
                          {o.proof.method === 'pin' ? <KeyRound className="size-4 text-success" /> : <Camera className="size-4 text-success" />}
                          {o.proof.method === 'pin' ? 'Recipient PIN' : 'Photo'}{o.proof.receivedBy && ` · ${o.proof.receivedBy}`}
                        </span>
                        {o.proof.photoUrl && <a className="mt-1 block text-primary hover:underline" href={o.proof.photoUrl} target="_blank" rel="noreferrer">View photo</a>}
                      </Detail>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Charges</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge tone={o.paymentStatus === 'paid' ? 'success' : 'warning'}>{humanize(o.paymentStatus)}</Badge>
                      <span className="text-xs text-muted-foreground">{humanize(o.paymentMethod)}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {o.estimate.lines.map((l) => (
                      <div key={l.code} className="flex justify-between">
                        <span className="text-muted-foreground">{humanize(l.label)}</span>
                        <span className="tabular">{formatNaira(l.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-2 font-medium">
                      <span>Estimate</span><span className="tabular">{formatNaira(o.estimate.total)}</span>
                    </div>
                    {o.adjustment && (
                      <div className="rounded-md bg-accent-soft p-3">
                        <div className="flex justify-between font-medium">
                          <span>Adjusted at pickup</span><span className="tabular">{formatNaira(o.adjustment.to)}</span>
                        </div>
                        {o.adjustment.reason && <p className="mt-1 text-muted-foreground">“{o.adjustment.reason}”</p>}
                      </div>
                    )}
                    {o.paymentStatus === 'unpaid' && can('finance') && !['cancelled', 'returned'].includes(o.status) && (
                      <Button variant="outline" size="sm" className="mt-2" loading={markPaid.isPending} onClick={() => markPaid.mutate(undefined, { onSuccess: () => toast.success('Payment recorded') })}>
                        Mark as paid
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader><CardTitle>Rider</CardTitle></CardHeader>
                  <CardContent className="text-sm">
                    {o.rider ? (
                      <Link to={`/riders/${o.rider.id}`} className="block rounded-md hover:bg-muted">
                        <p className="font-medium">{o.rider.name}</p>
                        <p className="text-muted-foreground">{o.rider.code} · {formatPhone(o.rider.phone)}</p>
                      </Link>
                    ) : (
                      <p className="text-muted-foreground">Not assigned yet — automatic dispatch is offering this job to nearby riders.</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
                  <CardContent><OrderTimeline events={o.events} /></CardContent>
                </Card>
              </div>
            </div>

            <AssignRiderDialog orderId={o.id} zoneId={o.pickup.zone.id} open={assignOpen} onOpenChange={setAssignOpen} />
            <ReasonDialog
              open={cancelOpen}
              onOpenChange={setCancelOpen}
              title="Cancel this order?"
              description="The sender is notified by SMS. This cannot be undone."
              confirmLabel="Cancel order"
              loading={cancel.isPending}
              onConfirm={(reason) => cancel.mutate(reason, { onSuccess: () => { toast.success('Order cancelled'); setCancelOpen(false); } })}
            />
          </>
        )}
      </QueryState>
    </>
  );
}

function StopCard({ title, stop }: { title: string; stop: StopDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Badge tone="info">{stop.zone.name}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="font-medium">{stop.contactName}</p>
        <p className="flex items-center gap-2 text-muted-foreground"><Phone className="size-3.5" />{formatPhone(stop.phone)}</p>
        <p className="flex items-start gap-2 text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span>{stop.address}, {stop.area}{stop.landmark && <><br />Near {stop.landmark}</>}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function Detail({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-medium">{children}</div>
    </div>
  );
}
