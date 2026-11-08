import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import {
  PARCEL_SIZE_META,
  PAYMENT_METHOD_LABELS,
  SERVICE_LEVEL_META,
} from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { formatDateTime } from '@estene/lib/date';
import { formatPhone } from '@estene/lib/utils';
import { Card } from '@estene/ui/card';
import { ShipmentStatusBadge } from '@estene/ui/ShipmentStatusBadge';
import { BackLink } from '@/shared/components/BackLink';
import { QueryState } from '@/shared/components/QueryState';
import { useDelivery } from './deliveries.queries';

export default function DeliveryDetailPage() {
  const { ref = '' } = useParams();
  const q = useDelivery(ref);
  const s = q.data;

  return (
    <>
      <BackLink to="/deliveries" label="Deliveries" />
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {s && (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-display font-mono text-2xl font-bold">{s.trackingNumber}</h1>
                  <ShipmentStatusBadge status={s.status} />
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {s.clientReference && `Your ref ${s.clientReference} · `}
                  {s.order && `Order ${s.order.number} · `}
                  <a
                    href={s.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Public tracking page
                  </a>
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <Card className="p-5">
                <h2 className="mb-4 font-semibold">Timeline</h2>
                <ol className="space-y-3">
                  {[...s.events].reverse().map((e, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span
                        className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                        aria-hidden
                      />
                      <div>
                        <p className="font-medium">{SHIPMENT_STATUS_META[e.status].label}</p>
                        {e.note && <p className="text-muted-foreground">{e.note}</p>}
                        <p className="text-muted-foreground text-xs">{formatDateTime(e.at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                {s.proofOfDelivery && (
                  <div className="mt-5 border-t pt-4 text-sm">
                    <p className="font-medium">Proof of delivery</p>
                    <p className="text-muted-foreground">
                      {s.proofOfDelivery.method === 'pin' ? 'Recipient PIN' : 'Photo'}
                      {s.proofOfDelivery.receivedBy &&
                        ` · received by ${s.proofOfDelivery.receivedBy}`}
                      {' · '}
                      {formatDateTime(s.proofOfDelivery.at)}
                    </p>
                    {s.proofOfDelivery.photoUrl && (
                      <img
                        src={s.proofOfDelivery.photoUrl}
                        alt="Delivery photo"
                        className="mt-3 max-h-64 rounded-lg border"
                      />
                    )}
                  </div>
                )}
              </Card>

              <div className="space-y-6">
                <Card className="space-y-2 p-5 text-sm">
                  <h2 className="font-semibold">Recipient</h2>
                  <p>
                    {s.dropoff.contactName}
                    <span className="text-muted-foreground block">
                      {formatPhone(s.dropoff.phone)}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {s.dropoff.address}, {s.dropoff.area}
                    {s.dropoff.landmark && ` (${s.dropoff.landmark})`}
                  </p>
                </Card>
                <Card className="p-5 text-sm">
                  <h2 className="mb-3 font-semibold">Parcel & charge</h2>
                  <dl className="space-y-2">
                    <Row label="Size">{PARCEL_SIZE_META[s.parcel.size].label}</Row>
                    <Row label="Weight">{s.parcel.weightKg} kg</Row>
                    <Row label="Service">{SERVICE_LEVEL_META[s.serviceLevel].label}</Row>
                    <Row label="Payment">{PAYMENT_METHOD_LABELS[s.paymentMethod]}</Row>
                    <Row label="Amount">{formatNaira(s.amount.final ?? s.amount.estimate)}</Row>
                    {s.priceAdjustment && (
                      <Row label="Re-priced">
                        {formatNaira(s.priceAdjustment.from)} → {formatNaira(s.priceAdjustment.to)}
                      </Row>
                    )}
                  </dl>
                  {s.parcel.description && (
                    <p className="text-muted-foreground mt-3 border-t pt-3">
                      {s.parcel.description}
                    </p>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
