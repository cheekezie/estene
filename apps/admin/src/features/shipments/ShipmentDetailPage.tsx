import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Building2, Camera, KeyRound, MapPin, Phone, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import {
  PARCEL_SIZE_META,
  PAYMENT_METHOD_LABELS,
  SERVICE_LEVEL_META,
} from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import { isTerminal } from '@estene/contracts/shipment-status';
import type { StopDto } from '@estene/contracts/shipment';
import { formatDateTime } from '@estene/lib/date';
import { formatPhone, humanize } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { ShipmentStatusBadge } from '@estene/ui/ShipmentStatusBadge';
import { QueryState } from '@/shared/components/QueryState';
import { ReasonDialog } from '@/shared/components/ReasonDialog';
import { useCan } from '@/shared/hooks/useCan';
import { AssignRiderDialog } from './components/AssignRiderDialog';
import { ShipmentTimeline } from './components/ShipmentTimeline';
import { useCancelShipment, useMarkPaid, useShipment, useUnassignRider } from './shipments.queries';

/** Cash is marked paid automatically when the rider collects it. */
const CASH_METHODS: string[] = ['cash_on_pickup', 'cash_on_delivery'];

const SOURCE_LABEL = { web: 'website', admin: 'phone booking', api: 'API' } as const;

export default function ShipmentDetailPage() {
  const { id = '' } = useParams();
  const q = useShipment(id);
  const can = useCan();
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancel = useCancelShipment(id);
  const unassign = useUnassignRider(id);
  const markPaid = useMarkPaid(id);
  const o = q.data;

  return (
    <>
      <Link
        to="/shipments"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Shipments
      </Link>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {o && (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-mono text-2xl font-bold tracking-tight">
                    {o.trackingNumber}
                  </h1>
                  <ShipmentStatusBadge status={o.status} />
                </div>
                <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                  <span>
                    Booked {formatDateTime(o.createdAt)} via {SOURCE_LABEL[o.source]} ·{' '}
                    {SERVICE_LEVEL_META[o.serviceLevel].label}
                  </span>
                  {o.client && (
                    <Link
                      to={`/clients/${o.client.id}`}
                      className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
                    >
                      <Building2 className="size-3.5" />
                      {o.client.name}
                      {o.clientReference && (
                        <span className="text-muted-foreground font-mono font-normal">
                          #{o.clientReference}
                        </span>
                      )}
                    </Link>
                  )}
                </p>
              </div>
              {can('ops_manager', 'dispatcher') && !isTerminal(o.status) && (
                <div className="flex flex-wrap gap-2">
                  {o.status === 'created' && (
                    <Button onClick={() => setAssignOpen(true)}>Assign rider</Button>
                  )}
                  {(o.status === 'assigned' || o.status === 'en_route_to_pickup') && (
                    <Button
                      variant="outline"
                      loading={unassign.isPending}
                      onClick={() =>
                        unassign.mutate('Reassigned by ops', {
                          onSuccess: () => toast.success('Rider removed — back in dispatch'),
                        })
                      }
                    >
                      Remove rider
                    </Button>
                  )}
                  {['created', 'assigned', 'en_route_to_pickup'].includes(o.status) && (
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setCancelOpen(true)}
                    >
                      Cancel shipment
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
                  <CardHeader>
                    <CardTitle>Parcel</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 text-sm sm:grid-cols-4">
                    <Detail label="Size">{PARCEL_SIZE_META[o.parcel.size].label}</Detail>
                    <Detail label="Weight">{o.parcel.weightKg} kg</Detail>
                    <Detail label="Fragile">{o.parcel.fragile ? 'Yes' : 'No'}</Detail>
                    <Detail label="Declared value">
                      {o.parcel.declaredValue ? formatNaira(o.parcel.declaredValue) : '—'}
                    </Detail>
                    <Detail label="Contents" className="sm:col-span-4">
                      {o.parcel.description}
                    </Detail>
                    {o.tagCode && (
                      <Detail label="QR tag" className="sm:col-span-2">
                        <span className="inline-flex items-center gap-1.5 font-mono">
                          <QrCode className="text-primary size-4" />
                          {o.tagCode}
                        </span>
                      </Detail>
                    )}
                    {o.proof && (
                      <Detail label="Proof of delivery" className="sm:col-span-2">
                        <span className="inline-flex items-center gap-1.5">
                          {o.proof.method === 'pin' ? (
                            <KeyRound className="text-success size-4" />
                          ) : (
                            <Camera className="text-success size-4" />
                          )}
                          {o.proof.method === 'pin' ? 'Recipient PIN' : 'Photo'}
                          {o.proof.receivedBy && ` · ${o.proof.receivedBy}`}
                        </span>
                        {o.proof.photoUrl && (
                          <a
                            className="text-primary mt-1 block hover:underline"
                            href={o.proof.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View photo
                          </a>
                        )}
                      </Detail>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Charges</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge tone={o.paymentStatus === 'paid' ? 'success' : 'warning'}>
                        {humanize(o.paymentStatus)}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {PAYMENT_METHOD_LABELS[o.paymentMethod]}
                      </span>
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
                      <span>Estimate</span>
                      <span className="tabular">{formatNaira(o.estimate.total)}</span>
                    </div>
                    {o.adjustment && (
                      <div className="bg-accent-soft rounded-md p-3">
                        <div className="flex justify-between font-medium">
                          <span>Adjusted at pickup</span>
                          <span className="tabular">{formatNaira(o.adjustment.to)}</span>
                        </div>
                        {o.adjustment.reason && (
                          <p className="text-muted-foreground mt-1">“{o.adjustment.reason}”</p>
                        )}
                      </div>
                    )}
                    {o.paymentStatus === 'unpaid' &&
                      !CASH_METHODS.includes(o.paymentMethod) &&
                      can('finance') &&
                      !['cancelled', 'returned'].includes(o.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          loading={markPaid.isPending}
                          onClick={() =>
                            markPaid.mutate(undefined, {
                              onSuccess: () => toast.success('Payment recorded'),
                            })
                          }
                        >
                          Mark as paid
                        </Button>
                      )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Rider</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {o.rider ? (
                      <Link
                        to={`/riders/${o.rider.id}`}
                        className="hover:bg-muted block rounded-md"
                      >
                        <p className="font-medium">{o.rider.name}</p>
                        <p className="text-muted-foreground">
                          {o.rider.code} · {formatPhone(o.rider.phone)}
                        </p>
                      </Link>
                    ) : (
                      <p className="text-muted-foreground">
                        Not assigned yet — automatic dispatch is offering this job to nearby riders.
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ShipmentTimeline events={o.events} />
                  </CardContent>
                </Card>
              </div>
            </div>

            <AssignRiderDialog
              shipmentId={o.id}
              zoneId={o.pickup.zone.id}
              open={assignOpen}
              onOpenChange={setAssignOpen}
            />
            <ReasonDialog
              open={cancelOpen}
              onOpenChange={setCancelOpen}
              title="Cancel this shipment?"
              description="The sender is notified by SMS. This cannot be undone."
              confirmLabel="Cancel shipment"
              loading={cancel.isPending}
              onConfirm={(reason) =>
                cancel.mutate(reason, {
                  onSuccess: () => {
                    toast.success('Shipment cancelled');
                    setCancelOpen(false);
                  },
                })
              }
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
        <p className="text-muted-foreground flex items-center gap-2">
          <Phone className="size-3.5" />
          {formatPhone(stop.phone)}
        </p>
        <p className="text-muted-foreground flex items-start gap-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {stop.address}, {stop.area}
            {stop.landmark && (
              <>
                <br />
                Near {stop.landmark}
              </>
            )}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="mt-0.5 font-medium">{children}</div>
    </div>
  );
}
