import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Banknote, Package, Pencil, Plus, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { formatNaira } from '@estene/contracts/money';
import { formatPhone } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { QueryState } from '@/shared/components/QueryState';
import { StatTile } from '@/shared/components/StatTile';
import { useCan } from '@/shared/hooks/useCan';
import { ApiKeysCard } from './components/ApiKeysCard';
import { ClientFormDialog } from './components/ClientFormDialog';
import { WebhookCard } from './components/WebhookCard';
import { useClient, useSetClientStatus } from './clients.queries';

export default function ClientDetailPage() {
  const { id = '' } = useParams();
  const q = useClient(id);
  const can = useCan();
  const canManage = can('ops_manager');
  const setStatus = useSetClientStatus(id);
  const [editing, setEditing] = useState(false);
  const c = q.data;

  return (
    <>
      <Link
        to="/clients"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Business clients
      </Link>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {c && (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-2xl font-bold">{c.name}</h1>
                  <Badge tone={c.status === 'active' ? 'success' : 'error'}>
                    {c.status === 'active' ? 'Active' : 'Suspended'}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {c.contactName} · {formatPhone(c.phone)} · {c.email}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {can('ops_manager', 'dispatcher', 'support') && c.status === 'active' && (
                  <Button asChild>
                    <Link to={`/orders/new?clientId=${c.id}`}>
                      <Plus />
                      Book for {c.name}
                    </Link>
                  </Button>
                )}
                {canManage && (
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil />
                    Edit
                  </Button>
                )}
                {canManage && (
                  <Button
                    variant="ghost"
                    className={c.status === 'active' ? 'text-destructive' : ''}
                    loading={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate(c.status === 'active' ? 'suspended' : 'active', {
                        onSuccess: () =>
                          toast.success(
                            c.status === 'active'
                              ? 'Client suspended — API access cut off'
                              : 'Client reactivated',
                          ),
                      })
                    }
                  >
                    {c.status === 'active' ? 'Suspend' : 'Reactivate'}
                  </Button>
                )}
              </div>
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <StatTile label="Orders" value={c.stats.orders} icon={Package} />
              <StatTile label="In progress" value={c.stats.activeOrders} icon={Truck} />
              <StatTile
                label="Outstanding on account"
                value={formatNaira(c.stats.outstanding)}
                hint="Delivered, not yet paid"
                icon={Banknote}
                highlight={c.stats.outstanding > 0}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-5">
              <div className="space-y-6 xl:col-span-2">
                <ApiKeysCard clientId={c.id} keys={c.apiKeys} canManage={canManage} />
                <Card>
                  <CardHeader>
                    <CardTitle>Orders</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <Link
                      to={`/orders?clientId=${c.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      View all {c.stats.orders} orders →
                    </Link>
                    {c.notes && <p className="text-muted-foreground mt-4">{c.notes}</p>}
                  </CardContent>
                </Card>
              </div>
              <div className="xl:col-span-3">
                <WebhookCard key={c.webhook?.url ?? 'none'} client={c} canManage={canManage} />
              </div>
            </div>
          </>
        )}
      </QueryState>
      {editing && c && <ClientFormDialog client={c} onClose={() => setEditing(false)} />}
    </>
  );
}
