import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CheckCircle2,
  Clock,
  PackageOpen,
  PackagePlus,
  Truck,
} from 'lucide-react';
import { cycleLastDay } from '@estene/contracts/handling-fee';
import type { PortalOverviewDto } from '@estene/contracts/portal';
import { formatDate } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { Card } from '@estene/ui/card';
import { formatNaira } from '@estene/contracts/money';
import { Button } from '@estene/ui/button';
import { api } from '@/lib/api';
import { PageHeader } from '@/shared/components/PageHeader';
import { QueryState } from '@/shared/components/QueryState';
import { StatTile } from '@/shared/components/StatTile';
import { useAuthStore } from '@/stores/auth.store';

export default function OverviewPage() {
  const user = useAuthStore((s) => s.user);
  const q = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.get<PortalOverviewDto>('/portal/overview'),
    refetchInterval: 60_000,
  });
  const o = q.data;

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name.split(' ')[0] ?? ''}`}
        description={user?.client.name}
        actions={
          user?.client.warehousing && (
            <Button asChild>
              <Link to="/orders/new">New order</Link>
            </Button>
          )
        }
      />
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {o && (
          <div className="space-y-8">
            <section className="grid gap-4 sm:grid-cols-3">
              <StatTile label="Deliveries in progress" value={o.shipments.active} icon={Truck} />
              <StatTile
                label="Delivered this month"
                value={o.shipments.deliveredThisMonth}
                icon={CheckCircle2}
              />
              <StatTile
                label="Balance due"
                value={formatNaira(o.outstanding)}
                hint="Delivery charges and fees not yet paid"
                icon={Banknote}
                highlight={o.outstanding > 0}
              />
            </section>
            {o.handlingFee && <HandlingFeeCard fee={o.handlingFee} />}
            {o.warehouse && (
              <section>
                <h2 className="mb-3 font-semibold">Warehouse</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatTile
                    label="Units in stock"
                    value={o.warehouse.unitsOnHand.toLocaleString()}
                    hint={`${o.warehouse.products} products`}
                    icon={Boxes}
                  />
                  <StatTile
                    label="Running low"
                    value={o.warehouse.lowStock}
                    hint="At or below your threshold"
                    icon={AlertTriangle}
                    highlight={o.warehouse.lowStock > 0}
                  />
                  <StatTile label="Open orders" value={o.warehouse.openOrders} icon={PackageOpen} />
                  <StatTile
                    label="Waiting for stock"
                    value={o.warehouse.awaitingStock}
                    icon={Clock}
                    highlight={o.warehouse.awaitingStock > 0}
                  />
                  <StatTile
                    label="Inbounds expected"
                    value={o.warehouse.expectedInbounds}
                    icon={PackagePlus}
                  />
                </div>
              </section>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}

/** Warehouse handling fee: what's owed now and what this month is heading for. */
function HandlingFeeCard({ fee }: { fee: NonNullable<PortalOverviewDto['handlingFee']> }) {
  const c = fee.current;
  const owing = fee.totalDue > 0;
  return (
    <Card
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 p-5',
        fee.overdue
          ? 'border-destructive/40 bg-destructive-soft/40'
          : owing && 'bg-accent-soft border-amber-300',
      )}
    >
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <p className="text-muted-foreground text-sm">Handling fee to pay</p>
          <p className="font-display tabular mt-1 text-2xl font-bold">
            {formatNaira(fee.totalDue)}
          </p>
          <p
            className={cn(
              'mt-0.5 text-xs',
              fee.overdue ? 'text-destructive font-medium' : 'text-muted-foreground',
            )}
          >
            {fee.overdue
              ? 'Overdue — please pay now'
              : fee.nextDueAt
                ? `Due ${formatDate(fee.nextDueAt)}`
                : 'All paid up'}
          </p>
        </div>
        {c && (
          <div>
            <p className="text-muted-foreground text-sm">This month so far</p>
            <p className="font-display tabular mt-1 text-2xl font-bold">
              {c.free ? 'Free' : formatNaira(c.amount)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {c.units.billed} units · ends {formatDate(cycleLastDay(c.periodEnd))}
            </p>
          </div>
        )}
      </div>
      <Button asChild variant={owing ? 'primary' : 'outline'}>
        <Link to="/billing">{owing ? 'Pay now' : 'View handling fees'}</Link>
      </Button>
    </Card>
  );
}
