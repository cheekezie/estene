import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertTriangle, Banknote, Bike, PackageCheck, PackagePlus } from 'lucide-react';
import type { OrderStatus } from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import { ORDER_STATUS_META } from '@estene/contracts/order-status';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { OrderStatusBadge } from '@estene/ui/OrderStatusBadge';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { PageHeader } from '@/shared/components/PageHeader';
import { QueryState } from '@/shared/components/QueryState';
import { StatTile } from '@/shared/components/StatTile';

type Overview = {
  today: { booked: number; delivered: number; revenue: number };
  pipeline: Partial<Record<OrderStatus, number>>;
  needsRider: number;
  riders: { active: number; online: number };
  last7Days: { date: string; booked: number; delivered: number }[];
};

const PIPELINE: OrderStatus[] = ['created', 'assigned', 'en_route_to_pickup', 'picked_up', 'in_transit', 'at_hub', 'out_for_delivery', 'delivery_failed'];

export default function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Overview>('/dashboard/overview'), refetchInterval: 30_000 });
  const d = q.data;

  return (
    <>
      <PageHeader title="Overview" description={format(new Date(), 'EEEE, d MMMM')} />
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {d && (
          <div className="space-y-6">
            {d.needsRider > 0 && (
              <Link to="/orders?status=created" className="flex items-center gap-3 rounded-lg border border-amber-300 bg-accent-soft px-4 py-3 text-sm">
                <AlertTriangle className="size-4 text-amber-600" />
                <span><strong>{d.needsRider}</strong> {d.needsRider === 1 ? 'order has' : 'orders have'} no rider after automatic dispatch — assign manually.</span>
              </Link>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Booked today" value={d.today.booked} icon={PackagePlus} />
              <StatTile label="Delivered today" value={d.today.delivered} icon={PackageCheck} />
              <StatTile label="Revenue today" value={formatNaira(d.today.revenue)} icon={Banknote} highlight />
              <StatTile label="Riders online" value={`${d.riders.online} / ${d.riders.active}`} hint="Online / active riders" icon={Bike} />
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Live pipeline</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {PIPELINE.map((s) => (
                    <Link key={s} to={`/orders?status=${s}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted">
                      <OrderStatusBadge status={s} />
                      <span className="tabular text-sm font-semibold">{d.pipeline[s] ?? 0}</span>
                    </Link>
                  ))}
                </CardContent>
              </Card>

              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle>Last 7 days</CardTitle>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-blue-200" />Booked</span>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" />{ORDER_STATUS_META.delivered.label}</span>
                  </div>
                </CardHeader>
                <CardContent><WeekChart days={d.last7Days} /></CardContent>
              </Card>
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}

function WeekChart({ days }: { days: Overview['last7Days'] }) {
  const series = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86_400_000);
    const key = format(date, 'yyyy-MM-dd');
    return { label: format(date, 'EEE'), ...(days.find((d) => d.date === key) ?? { booked: 0, delivered: 0 }) };
  });
  const max = Math.max(1, ...series.map((s) => s.booked));

  return (
    <div className="flex h-48 items-end gap-3" role="img" aria-label="Orders booked and delivered over the last 7 days">
      {series.map((s) => (
        <div key={s.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="relative flex h-40 w-full max-w-10 items-end" title={`${s.booked} booked, ${s.delivered} delivered`}>
            <div className="absolute bottom-0 w-full rounded-t bg-blue-200" style={{ height: `${(s.booked / max) * 100}%` }} />
            <div className="absolute bottom-0 w-full rounded-t bg-primary" style={{ height: `${(s.delivered / max) * 100}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
