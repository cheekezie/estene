import { Link } from 'react-router';
import { ArrowRight, Building, MapPin, Truck } from 'lucide-react';
import type { ShipmentDto } from '@estene/contracts/shipment';
import { Badge } from '@estene/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';

/** How this parcel travels — only shown when it passes through an office. */
export function RouteCard({ shipment: s }: { shipment: ShipmentDto }) {
  const f = s.fulfilment;
  if (!f.originOffice && !f.destinationOffice) return null;

  const steps = [
    f.originMode === 'dropoff'
      ? { icon: Building, label: `Dropped off at ${f.originOffice?.name}` }
      : { icon: MapPin, label: `Picked up in ${s.pickup.area}` },
    ...(f.originMode === 'pickup' && f.originOffice
      ? [{ icon: Building, label: `Via ${f.originOffice.name}` }]
      : []),
    ...(f.interstate ? [{ icon: Truck, label: `Manifest to ${f.destinationOffice?.city}` }] : []),
    ...(f.interstate || f.deliveryMode === 'collection'
      ? [{ icon: Building, label: f.destinationOffice?.name ?? '' }]
      : []),
    f.deliveryMode === 'collection'
      ? { icon: Building, label: 'Recipient collects' }
      : { icon: MapPin, label: `Delivered to ${s.dropoff.area}` },
  ].filter((step, i, all) => i === 0 || step.label !== all[i - 1]!.label);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Route</CardTitle>
        <div className="flex gap-2">
          {f.interstate && <Badge tone="info">Interstate</Badge>}
          {f.currentOffice && <Badge tone="progress">At {f.currentOffice.name}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ol className="flex flex-wrap items-center gap-2">
          {steps.map(({ icon: Icon, label }, i) => (
            <li key={i} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="text-muted-foreground size-3.5" />}
              <span className="bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-1">
                <Icon className="text-primary size-3.5" />
                {label}
              </span>
            </li>
          ))}
        </ol>
        {f.manifest && (
          <p>
            On manifest{' '}
            <Link
              to={`/manifests/${f.manifest.id}`}
              className="text-primary font-mono font-medium hover:underline"
            >
              {f.manifest.code}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
