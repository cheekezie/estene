import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { formatNaira } from '@estene/contracts/money';
import { timeAgo } from '@estene/lib/date';
import { formatPhone, humanize } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { OrderStatusBadge } from '@estene/ui/OrderStatusBadge';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { useZones } from '../zones/zones.queries';
import { useOrders } from '../orders/orders.queries';
import { RIDER_STATUS_TONE } from './RidersPage';
import { useRider, useSetRiderStatus } from './riders.queries';

export default function RiderDetailPage() {
  const { id = '' } = useParams();
  const q = useRider(id);
  const zones = useZones();
  const orders = useOrders({ page: 1, riderId: id });
  const setStatus = useSetRiderStatus(id);
  const can = useCan();
  const r = q.data;
  const zoneName = (zid: string) => zones.data?.find((z) => z.id === zid)?.name ?? '…';

  return (
    <>
      <Link to="/riders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Riders</Link>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {r && (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-2xl font-bold">{r.firstName} {r.lastName}</h1>
                  <Badge tone={RIDER_STATUS_TONE[r.status]}>{humanize(r.status)}</Badge>
                  <Badge tone={r.isOnline ? 'success' : 'neutral'} dot>{r.isOnline ? 'Online' : 'Offline'}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{r.code} · {formatPhone(r.phone)} · {r.type === 'partner' ? `Partner${r.fleetName ? ` (${r.fleetName})` : ''}` : 'Company rider'}</p>
              </div>
              {can('ops_manager') && (
                <div className="flex gap-2">
                  {r.status !== 'active' && <Button loading={setStatus.isPending} onClick={() => setStatus.mutate('active', { onSuccess: () => toast.success('Rider activated') })}>Activate</Button>}
                  {r.status === 'active' && <Button variant="outline" className="text-destructive" loading={setStatus.isPending} onClick={() => setStatus.mutate('suspended', { onSuccess: () => toast.success('Rider suspended') })}>Suspend</Button>}
                </div>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row label="Vehicle">{humanize(r.vehicleType)}{r.plateNumber && ` · ${r.plateNumber}`}</Row>
                  <Row label="Primary zone">{r.primaryZone?.name ?? '—'}</Row>
                  <Row label="Coverage">
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.coverageZoneIds.map((z) => <Badge key={z} tone="info">{zoneName(z)}</Badge>)}
                    </div>
                  </Row>
                  {r.type === 'partner' && <Row label="Commission">{r.commissionPct != null ? `${r.commissionPct}%` : 'Platform default'}</Row>}
                  <Row label="Active jobs">{r.activeJobs}</Row>
                  <Row label="Last seen">
                    {r.lastLocation ? (
                      <a className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${r.lastLocation.lat},${r.lastLocation.lng}`}>
                        <MapPin className="size-3.5" />{timeAgo(new Date(r.lastLocation.at))}
                      </a>
                    ) : '—'}
                  </Row>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Recent jobs</CardTitle></CardHeader>
                <QueryState isLoading={orders.isLoading} error={orders.error} rows={3}>
                  <ul className="divide-y">
                    {orders.data?.items.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No jobs yet.</li>}
                    {orders.data?.items.map((o) => (
                      <li key={o.id}>
                        <Link to={`/orders/${o.id}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-muted/50">
                          <div>
                            <p className="font-mono font-medium">{o.trackingNumber}</p>
                            <p className="text-xs text-muted-foreground">{o.pickup.area} → {o.dropoff.area}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="tabular hidden sm:inline">{formatNaira(o.finalAmount ?? o.estimate.total)}</span>
                            <OrderStatusBadge status={o.status} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </QueryState>
              </Card>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
