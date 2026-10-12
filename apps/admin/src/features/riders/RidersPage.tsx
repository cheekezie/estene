import { useState } from 'react';
import { Link } from 'react-router';
import { Bike, Plus, Search } from 'lucide-react';
import { RIDER_STATUSES, RIDER_TYPES, type RiderStatus, type RiderType } from '@estene/contracts/enums';
import { formatPhone, humanize } from '@estene/lib/utils';
import { Badge, type BadgeTone } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { OnboardRiderDialog } from './components/OnboardRiderDialog';
import { useRiders } from './riders.queries';

export const RIDER_STATUS_TONE: Record<RiderStatus, BadgeTone> = { pending: 'warning', active: 'success', suspended: 'error' };

export default function RidersPage() {
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<RiderType | ''>('');
  const [status, setStatus] = useState<RiderStatus | ''>('');
  const [onboardOpen, setOnboardOpen] = useState(false);
  const debounced = useDebounce(search.trim());

  const q = useRiders({ page, search: debounced || undefined, type: type || undefined, status: status || undefined });

  return (
    <>
      <PageHeader
        title="Riders"
        description="Company riders and partner fleets across Abuja."
        actions={can('ops_manager') && <Button onClick={() => setOnboardOpen(true)}><Plus />Onboard rider</Button>}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name, phone, rider code or fleet" className="pl-9" aria-label="Search riders" />
          </div>
          <Select className="w-40" aria-label="Rider type" placeholder="All types" value={type} onChange={(e) => { setType(e.target.value as RiderType | ''); setPage(1); }} options={RIDER_TYPES.map((t) => ({ value: t, label: humanize(t) }))} />
          <Select className="w-40" aria-label="Status" placeholder="All statuses" value={status} onChange={(e) => { setStatus(e.target.value as RiderStatus | ''); setPage(1); }} options={RIDER_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data?.items.length === 0 ? (
            <EmptyState icon={Bike} title="No riders yet" description="Onboard your first company or partner rider to start dispatching." />
          ) : q.data && (
            <>
              <Table>
                <THead><TR><TH>Rider</TH><TH>Type</TH><TH>Primary zone</TH><TH>Vehicle</TH><TH>Jobs</TH><TH>Presence</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {q.data.items.map((r) => (
                    <TR key={r.id} className="hover:bg-muted/50">
                      <TD>
                        <Link to={`/riders/${r.id}`} className="font-medium text-primary hover:underline">{r.firstName} {r.lastName}</Link>
                        <p className="text-xs text-muted-foreground">{r.code} · {formatPhone(r.phone)}</p>
                      </TD>
                      <TD>{r.type === 'partner' ? <span>Partner{r.fleetName && <span className="block text-xs text-muted-foreground">{r.fleetName}</span>}</span> : 'Company'}</TD>
                      <TD>{r.primaryZone?.name ?? '—'}</TD>
                      <TD>{humanize(r.vehicleType)}</TD>
                      <TD className="tabular">{r.activeJobs}</TD>
                      <TD><Badge tone={r.isOnline ? 'success' : 'neutral'} dot>{r.isOnline ? 'Online' : 'Offline'}</Badge></TD>
                      <TD><Badge tone={RIDER_STATUS_TONE[r.status]}>{humanize(r.status)}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <OnboardRiderDialog open={onboardOpen} onOpenChange={setOnboardOpen} />
    </>
  );
}
