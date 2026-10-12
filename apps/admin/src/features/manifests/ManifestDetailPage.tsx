import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, ArrowRight, CheckCheck, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@estene/lib/errors';
import { formatDateTime } from '@estene/lib/date';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { ShipmentStatusBadge } from '@estene/ui/ShipmentStatusBadge';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { QueryState } from '@/shared/components/QueryState';
import { ScanBar } from '../office/components/ScanBar';
import { ManifestStatusBadge } from './ManifestStatusBadge';
import {
  useDepart,
  useLoadParcel,
  useManifest,
  useReceiveAll,
  useReceiveParcel,
  useUnloadParcel,
  useUpdateManifest,
} from './manifests.queries';

export default function ManifestDetailPage() {
  const { id = '' } = useParams();
  const q = useManifest(id);
  const load = useLoadParcel(id);
  const unload = useUnloadParcel(id);
  const depart = useDepart(id);
  const receive = useReceiveParcel(id);
  const receiveAll = useReceiveAll(id);
  const m = q.data;
  const onError = (e: unknown) => toast.error(errorMessage(e));

  return (
    <>
      <Link
        to="/manifests"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Manifests
      </Link>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {m && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-mono text-2xl font-bold">{m.code}</h1>
                  <ManifestStatusBadge status={m.status} />
                </div>
                <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
                  {m.from.name}, {m.from.city} <ArrowRight className="size-4" /> {m.to.name},{' '}
                  {m.to.city}
                </p>
              </div>
              <div className="flex gap-2">
                {m.status === 'open' && (
                  <Button
                    loading={depart.isPending}
                    disabled={!m.counts.total}
                    onClick={() =>
                      depart.mutate(undefined, {
                        onSuccess: () => toast.success('Departed — parcels are in transit'),
                        onError,
                      })
                    }
                  >
                    <Send />
                    Depart ({m.counts.total})
                  </Button>
                )}
                {(m.status === 'in_transit' || m.status === 'arrived') && (
                  <Button
                    variant="outline"
                    loading={receiveAll.isPending}
                    onClick={() =>
                      receiveAll.mutate(undefined, {
                        onSuccess: () => toast.success('All parcels checked in'),
                        onError,
                      })
                    }
                  >
                    <CheckCheck />
                    Receive all ({m.counts.total - m.counts.received})
                  </Button>
                )}
              </div>
            </div>

            {m.status === 'open' && (
              <ScanBar
                onScan={(code) =>
                  load.mutate(code, { onSuccess: () => toast.success('Loaded'), onError })
                }
                busy={load.isPending}
                placeholder="Scan a parcel to load it onto this manifest"
              />
            )}
            {(m.status === 'in_transit' || m.status === 'arrived') && (
              <ScanBar
                onScan={(code) =>
                  receive.mutate(code, { onSuccess: () => toast.success('Checked in'), onError })
                }
                busy={receive.isPending}
                placeholder="Scan each parcel as it comes off"
              />
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Parcels</CardTitle>
                  <span className="text-muted-foreground text-sm">
                    {m.status === 'open'
                      ? `${m.counts.total} loaded`
                      : `${m.counts.received} of ${m.counts.total} checked in`}
                  </span>
                </CardHeader>
                {m.shipments.length === 0 ? (
                  <p className="text-muted-foreground px-5 py-8 text-center text-sm">
                    Scan parcels waiting at {m.from.name} for {m.to.name}.
                  </p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Tracking no.</TH>
                        <TH>Tag</TH>
                        <TH>Destination</TH>
                        <TH>Status</TH>
                        <TH />
                      </TR>
                    </THead>
                    <TBody>
                      {m.shipments.map((s) => (
                        <TR key={s.id}>
                          <TD>
                            <Link
                              to={`/shipments/${s.id}`}
                              className="text-primary font-mono text-[13px] font-medium hover:underline"
                            >
                              {s.trackingNumber}
                            </Link>
                          </TD>
                          <TD className="font-mono text-xs">{s.tagCode ?? '—'}</TD>
                          <TD>{s.destinationArea}</TD>
                          <TD>
                            {m.status === 'open' ? (
                              <ShipmentStatusBadge status={s.status} />
                            ) : s.received ? (
                              <Badge tone="success">Checked in</Badge>
                            ) : (
                              <Badge tone="progress">On board</Badge>
                            )}
                          </TD>
                          <TD className="text-right">
                            {m.status === 'open' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Remove"
                                onClick={() => unload.mutate(s.id, { onError })}
                              >
                                <Trash2 className="text-muted-foreground" />
                              </Button>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>

              <div className="space-y-6">
                <CarrierCard id={id} manifest={m} />
                <Card>
                  <CardHeader>
                    <CardTitle>Timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Row label="Opened">
                      {formatDateTime(m.createdAt)}
                      {m.createdBy && ` · ${m.createdBy.name}`}
                    </Row>
                    <Row label="Departed">{m.departedAt ? formatDateTime(m.departedAt) : '—'}</Row>
                    <Row label="First arrival">
                      {m.arrivedAt ? formatDateTime(m.arrivedAt) : '—'}
                    </Row>
                    <Row label="Completed">{m.closedAt ? formatDateTime(m.closedAt) : '—'}</Row>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}

function CarrierCard({
  id,
  manifest: m,
}: {
  id: string;
  manifest: NonNullable<ReturnType<typeof useManifest>['data']>;
}) {
  const update = useUpdateManifest(id);
  const editable = m.status === 'open';
  const [f, setF] = useState({ ...m.carrier });
  const field = (
    k: 'carrierName' | 'waybillNumber' | 'vehiclePlate' | 'driverName' | 'driverPhone',
    label: string,
  ) => (
    <Field label={label}>
      <Input
        disabled={!editable}
        value={f[k] ?? ''}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </Field>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.carrier.type === 'partner' ? 'Partner carrier' : 'Estene vehicle'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {m.carrier.type === 'partner' ? (
          <>
            {field('carrierName', 'Transport company')}
            {field('waybillNumber', 'Waybill number')}
          </>
        ) : (
          <>
            {field('vehiclePlate', 'Plate')}
            {field('driverName', 'Driver')}
            {field('driverPhone', 'Driver phone')}
          </>
        )}
        {editable && (
          <Button
            size="sm"
            variant="outline"
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                {
                  carrierName: f.carrierName,
                  waybillNumber: f.waybillNumber,
                  vehiclePlate: f.vehiclePlate,
                  driverName: f.driverName,
                  driverPhone: f.driverPhone,
                },
                { onSuccess: () => toast.success('Carrier updated') },
              )
            }
          >
            Save carrier details
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
