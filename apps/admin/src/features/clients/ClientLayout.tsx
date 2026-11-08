import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { ArrowLeft, Code2, LayoutGrid, Pencil, Plus, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import { CLIENT_INDUSTRY_LABELS } from '@estene/contracts/client';
import { cn } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { useClient, useSetClientStatus, type ClientDetail } from './clients.queries';

type ClientContext = { client: ClientDetail; canManage: boolean };
export const useClientContext = () => useOutletContext<ClientContext>();

/** Shared header + tabs for /clients/:id (overview, warehousing, developer). */
export default function ClientLayout() {
  const { id = '' } = useParams();
  const q = useClient(id);
  const can = useCan();
  const canManage = can('ops_manager');
  const setStatus = useSetClientStatus(id);
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-display text-2xl font-bold">{c.name}</h1>
                  <Badge tone={c.status === 'active' ? 'success' : 'error'}>
                    {c.status === 'active' ? 'Active' : 'Suspended'}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {CLIENT_INDUSTRY_LABELS[c.industry]}
                  {` · ${c.address.area ?? c.address.zone?.name ?? c.address.line}, ${c.address.city}`}
                  {c.accountManager && ` · Managed by ${c.accountManager.name}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {can('ops_manager', 'dispatcher', 'support') && c.status === 'active' && (
                  <Button asChild>
                    <Link to={`/shipments/new?clientId=${c.id}`}>
                      <Plus />
                      Book shipment
                    </Link>
                  </Button>
                )}
                {canManage && (
                  <Button variant="outline" asChild>
                    <Link to={`/clients/${c.id}/edit`}>
                      <Pencil />
                      Edit
                    </Link>
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

            <nav className="mb-6 mt-6 flex gap-1 border-b" aria-label="Client sections">
              <Tab to={`/clients/${c.id}`} end icon={LayoutGrid} label="Overview" />
              <Tab to={`/clients/${c.id}/warehousing`} icon={Warehouse} label="Warehousing" />
              <Tab to={`/clients/${c.id}/developer`} icon={Code2} label="Developer" />
            </nav>

            <Outlet context={{ client: c, canManage } satisfies ClientContext} />
          </>
        )}
      </QueryState>
    </>
  );
}

function Tab({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string;
  end?: boolean;
  icon: typeof Code2;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'border-primary text-primary'
            : 'text-muted-foreground hover:text-foreground border-transparent',
        )
      }
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  );
}
