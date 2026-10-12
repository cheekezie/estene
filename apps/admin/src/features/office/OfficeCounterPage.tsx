import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Building, PackageSearch, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import type { ShipmentDto } from '@estene/contracts/shipment';
import { errorMessage } from '@estene/lib/errors';
import { formatRelativeDay } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Select } from '@estene/ui/select';
import { ShipmentStatusBadge } from '@estene/ui/ShipmentStatusBadge';
import { PageHeader } from '@/shared/components/PageHeader';
import { QueryState } from '@/shared/components/QueryState';
import { useAuthStore } from '@/stores/auth.store';
import { officeOptions, useOffices } from '../offices/offices.queries';
import { ParcelActions } from './components/ParcelActions';
import { ScanBar } from './components/ScanBar';
import {
  useOfficeQueue,
  useScan,
  type OfficeAction,
  type OfficeQueue,
  type ScanResult,
} from './office.queries';

const STORAGE_KEY = 'estene-counter-office';

/**
 * The office counter. Scan (hand scanner, camera or typing) to pull up a
 * parcel with exactly the actions allowed for it here; the queue below
 * offers the same actions for everything expected at this office.
 */
export default function OfficeCounterPage() {
  const user = useAuthStore((s) => s.user);
  const offices = useOffices();
  const ownOffice = user?.role === 'office_agent' ? user.office?.id : undefined;
  const [picked, setPicked] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const officeId = ownOffice ?? (picked || offices.data?.find((o) => o.isActive)?.id);

  useEffect(() => {
    if (!ownOffice && picked) {
      try {
        localStorage.setItem(STORAGE_KEY, picked);
      } catch {
        /* storage unavailable — the choice just isn't remembered */
      }
    }
  }, [picked, ownOffice]);

  const office = offices.data?.find((o) => o.id === officeId);

  return (
    <>
      <PageHeader
        title={office ? office.name : 'Office counter'}
        description={
          office
            ? `${office.zone.city} · ${office.code} · ${office.address}`
            : 'Drop-offs, hand-ins, manifests and collections.'
        }
        actions={
          !ownOffice && (
            <Select
              className="w-72"
              aria-label="Office"
              options={officeOptions(offices.data)}
              value={officeId ?? ''}
              onChange={(e) => setPicked(e.target.value)}
            />
          )
        }
      />
      {officeId ? (
        <Counter key={officeId} officeId={officeId} />
      ) : (
        <Card>
          <EmptyState
            icon={Building}
            title="No office selected"
            description="Create an office first, under Network → Offices."
          />
        </Card>
      )}
    </>
  );
}

function Counter({ officeId }: { officeId: string }) {
  const scan = useScan(officeId);
  const queue = useOfficeQueue(officeId);
  const [result, setResult] = useState<(ScanResult & { code: string }) | null>(null);

  const onScan = (code: string) =>
    scan.mutate(code, {
      onSuccess: (r) => setResult({ ...r, code }),
      onError: (e) => {
        setResult(null);
        toast.error(errorMessage(e));
      },
    });

  // After any action, refresh the scanned parcel so its card shows the new state and next step.
  const refreshed = queue.dataUpdatedAt;
  useEffect(() => {
    if (result)
      scan.mutate(result.code, { onSuccess: (r) => setResult({ ...r, code: result.code }) });
    // Only when the queue refetches (i.e. after an action), not on every scan.
  }, [refreshed]);

  const q = queue.data;
  return (
    <div className="space-y-6">
      <ScanBar onScan={onScan} busy={scan.isPending} />

      {result && <ScanCard officeId={officeId} result={result} queue={q} />}

      <QueryState isLoading={queue.isLoading} error={queue.error} onRetry={queue.refetch}>
        {q && (
          <div className="grid gap-6 xl:grid-cols-2">
            <QueueCard
              title="Expected drop-offs"
              hint="Booked to be dropped here"
              items={q.expectedDropoffs}
              officeId={officeId}
              queue={q}
              action="receive_dropoff"
            />
            <QueueCard
              title="Riders bringing parcels in"
              hint="First-mile pickups heading here"
              items={q.incomingRiders}
              officeId={officeId}
              queue={q}
              action="receive_from_rider"
              tagOnly
            />
            <QueueCard
              title="To send to another office"
              hint="Load onto a manifest"
              items={q.toSend}
              officeId={officeId}
              queue={q}
              action="add_to_manifest"
            />
            <QueueCard
              title="Need a delivery rider"
              hint="Arrived for door delivery"
              items={q.awaitingRider}
              officeId={officeId}
              queue={q}
              action="dispatch_for_delivery"
            />
            <QueueCard
              title="Prepare for collection"
              hint="Arrived for pickup by the recipient"
              items={q.toPrepareForCollection}
              officeId={officeId}
              queue={q}
              action="mark_ready_for_collection"
            />
            <QueueCard
              title="Waiting for the recipient"
              hint="Recipient has been sent the PIN"
              items={q.readyForCollection}
              officeId={officeId}
              queue={q}
              action="hand_to_recipient"
            />
            <ManifestsCard q={q} />
          </div>
        )}
      </QueryState>
    </div>
  );
}

function ScanCard({
  officeId,
  result,
  queue,
}: {
  officeId: string;
  result: ScanResult & { code: string };
  queue?: OfficeQueue;
}) {
  const s = result.shipment;
  const f = s.fulfilment;
  return (
    <Card className="border-primary/40 ring-primary/10 ring-2">
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <Link
                to={`/shipments/${s.id}`}
                className="font-mono text-xl font-bold hover:underline"
              >
                {s.trackingNumber}
              </Link>
              <ShipmentStatusBadge status={s.status} />
              {f.interstate && <Badge tone="info">Interstate</Badge>}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {s.parcel.description} · {s.parcel.size}, {s.parcel.weightKg} kg
              {s.tagCode && ` · tag ${s.tagCode}`}
            </p>
          </div>
          <RouteLine s={s} />
        </div>
        {result.actions.length ? (
          <ParcelActions
            officeId={officeId}
            shipment={s}
            actions={result.actions}
            scannedCode={result.code}
            queue={queue}
          />
        ) : f.manifest && s.status === 'at_hub' ? (
          <p className="bg-muted text-muted-foreground rounded-md p-3 text-sm">
            Loaded on{' '}
            <Link
              to={`/manifests/${f.manifest.id}`}
              className="text-foreground font-mono font-medium hover:underline"
            >
              {f.manifest.code}
            </Link>{' '}
            — it leaves when the manifest departs.
          </p>
        ) : (
          <p className="bg-muted text-muted-foreground rounded-md p-3 text-sm">
            Nothing to do with this parcel at this office right now — it’s{' '}
            {SHIPMENT_STATUS_META[s.status].label.toLowerCase()}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RouteLine({ s }: { s: ShipmentDto }) {
  const f = s.fulfilment;
  const from = f.originMode === 'dropoff' ? f.originOffice?.name : s.pickup.area;
  const to =
    f.deliveryMode === 'collection' ? `${f.destinationOffice?.name} (collection)` : s.dropoff.area;
  return (
    <p className="flex items-center gap-2 text-sm">
      <span className="font-medium">{from}</span>
      <ArrowRight className="text-muted-foreground size-4" />
      <span className="font-medium">{to}</span>
      {f.interstate && <span className="text-muted-foreground">· {f.destinationOffice?.city}</span>}
    </p>
  );
}

/** One counter task list. Each row carries the same action button the scan would give. */
function QueueCard({
  title,
  hint,
  items,
  officeId,
  queue,
  action,
  tagOnly,
}: {
  title: string;
  hint: string;
  items: ShipmentDto[];
  officeId: string;
  queue: OfficeQueue;
  action: OfficeAction;
  tagOnly?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
        </div>
        <Badge tone={items.length ? 'progress' : 'neutral'}>{items.length}</Badge>
      </CardHeader>
      {items.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-center text-sm">Nothing here.</p>
      ) : (
        <ul className="divide-y">
          {items.slice(0, 8).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <Link
                  to={`/shipments/${s.id}`}
                  className="font-mono text-sm font-semibold hover:underline"
                >
                  {s.trackingNumber}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {/* Before it's here, the counter is waiting for the sender; after, it's about the recipient. */}
                  {action === 'receive_dropoff'
                    ? `From ${s.pickup.contactName}`
                    : s.fulfilment.deliveryMode === 'collection'
                      ? `For ${s.dropoff.contactName}`
                      : `${s.pickup.contactName} → ${s.dropoff.area}`}{' '}
                  · {formatRelativeDay(s.createdAt)}
                </p>
              </div>
              {/* Rider hand-ins need the physical tag: point them to the scanner instead of a button. */}
              {tagOnly ? (
                <span className="text-muted-foreground text-xs">
                  {s.status === 'picked_up'
                    ? 'Scan tag on arrival'
                    : SHIPMENT_STATUS_META[s.status].label}
                </span>
              ) : (
                <ParcelActions
                  officeId={officeId}
                  shipment={s}
                  actions={[action]}
                  queue={queue}
                  size="sm"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {items.length > 8 && (
        <p className="text-muted-foreground border-t px-5 py-2 text-xs">
          +{items.length - 8} more — scan to find a specific parcel.
        </p>
      )}
    </Card>
  );
}

function ManifestsCard({ q }: { q: OfficeQueue }) {
  const rows: { m: OfficeQueue['openManifests'][number]; dir: 'out' | 'in' }[] = [
    ...q.openManifests.map((m) => ({ m, dir: 'out' as const })),
    ...q.incomingManifests.map((m) => ({ m, dir: 'in' as const })),
  ];
  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <div>
          <CardTitle>Manifests</CardTitle>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Loading here, and on the road to here
          </p>
        </div>
        <Link to="/manifests" className="text-primary text-xs hover:underline">
          All manifests
        </Link>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyStateSmall icon={Truck}>No open or incoming manifests.</EmptyStateSmall>
      ) : (
        <ul className="divide-y">
          {rows.map(({ m, dir }) => (
            <li key={m.id}>
              <Link
                to={`/manifests/${m.id}`}
                className="hover:bg-muted/50 flex items-center justify-between gap-3 px-5 py-3"
              >
                <span>
                  <span className="font-mono text-sm font-semibold">{m.code}</span>
                  <span className="text-muted-foreground block text-xs">
                    {dir === 'out'
                      ? `Loading → ${m.to.name}, ${m.to.city}`
                      : `From ${m.from.name}, ${m.from.city}`}{' '}
                    · {m.carrier.carrierName ?? m.carrier.vehiclePlate ?? 'carrier not set'}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <span className="tabular">
                    {dir === 'in'
                      ? `${m.counts.received}/${m.counts.total} in`
                      : `${m.counts.total} parcels`}
                  </span>
                  <Badge tone={dir === 'in' ? 'info' : 'progress'}>
                    {dir === 'in' ? 'Incoming' : 'Loading'}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EmptyStateSmall({
  icon: Icon,
  children,
}: {
  icon: typeof PackageSearch;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        'text-muted-foreground flex items-center justify-center gap-2 px-5 py-6 text-sm',
      )}
    >
      <Icon className="size-4" />
      {children}
    </p>
  );
}
