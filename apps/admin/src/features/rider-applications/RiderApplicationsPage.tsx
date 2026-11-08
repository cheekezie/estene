import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, FileText, Search, UserPlus } from 'lucide-react';
import type { RiderApplicationStatus } from '@estene/contracts/rider-application';
import { timeAgo } from '@estene/lib/date';
import { cn, formatPhone, humanize } from '@estene/lib/utils';
import { Badge, type BadgeTone } from '@estene/ui/badge';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Input } from '@estene/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useRiderApplications } from './rider-applications.queries';

export const APPLICATION_STATUS_TONE: Record<RiderApplicationStatus, BadgeTone> = {
  submitted: 'warning',
  vetting: 'info',
  approved: 'success',
  rejected: 'error',
};

export const APPLICATION_STATUS_LABEL: Record<RiderApplicationStatus, string> = {
  submitted: 'New',
  vetting: 'Vetting',
  approved: 'Approved',
  rejected: 'Rejected',
};

const TABS: { value: RiderApplicationStatus | ''; label: string }[] = [
  { value: 'submitted', label: 'New' },
  { value: 'vetting', label: 'Vetting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
];

export default function RiderApplicationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RiderApplicationStatus | ''>('submitted');
  const debounced = useDebounce(search.trim());
  const q = useRiderApplications({
    page,
    search: debounced || undefined,
    status: status || undefined,
  });
  const counts = q.data?.counts ?? {};

  return (
    <>
      <Link
        to="/riders"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Riders
      </Link>
      <PageHeader
        title="Rider applications"
        description="People who applied on the website. Invite them for vetting, upload the documents they bring, then approve."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div role="tablist" aria-label="Status" className="bg-muted flex rounded-lg p-1">
            {TABS.map((t) => {
              const n = t.value ? counts[t.value] : undefined;
              return (
                <button
                  key={t.label}
                  role="tab"
                  type="button"
                  aria-selected={status === t.value}
                  onClick={() => {
                    setStatus(t.value);
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    status === t.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                  {n ? <span className="text-primary ml-1.5 tabular-nums">{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="relative min-w-60 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Name, phone, reference or fleet"
              className="pl-9"
              aria-label="Search applications"
            />
          </div>
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data?.items.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={status === 'submitted' ? 'No new applications' : 'Nothing here'}
              description="Applications from the website’s “Apply to ride” form show up here."
            />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Applicant</TH>
                      <TH>Applying as</TH>
                      <TH>Area</TH>
                      <TH>Vehicle</TH>
                      <TH>Documents</TH>
                      <TH>Applied</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((a) => (
                      <TR key={a.id} className="hover:bg-muted/50">
                        <TD>
                          <Link
                            to={`/rider-applications/${a.id}`}
                            className="text-primary font-medium hover:underline"
                          >
                            {a.firstName} {a.lastName}
                          </Link>
                          <p className="text-muted-foreground text-xs">
                            {a.reference} · {formatPhone(a.phone)}
                          </p>
                        </TD>
                        <TD>{a.kind === 'fleet_owner' ? 'Fleet owner' : 'Rider'}</TD>
                        <TD>
                          {a.area}
                          {a.preferredZone && (
                            <span className="text-muted-foreground block text-xs">
                              {a.preferredZone.name}
                            </span>
                          )}
                        </TD>
                        <TD>{humanize(a.vehicleType)}</TD>
                        <TD>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <FileText className="text-muted-foreground size-3.5" />
                            {a.documentCount}
                          </span>
                        </TD>
                        <TD className="text-muted-foreground">{timeAgo(a.createdAt)}</TD>
                        <TD>
                          <Badge tone={APPLICATION_STATUS_TONE[a.status]}>
                            {APPLICATION_STATUS_LABEL[a.status]}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pagination
                  page={q.data.page}
                  totalPages={q.data.totalPages}
                  total={q.data.total}
                  onPage={setPage}
                />
              </>
            )
          )}
        </QueryState>
      </Card>
    </>
  );
}
