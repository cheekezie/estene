import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Plus, Truck } from 'lucide-react';
import { MANIFEST_STATUSES, type ManifestStatus } from '@estene/contracts/enums';
import { formatRelativeDay } from '@estene/lib/date';
import { humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useAuthStore } from '@/stores/auth.store';
import { CreateManifestDialog } from './CreateManifestDialog';
import { ManifestStatusBadge } from './ManifestStatusBadge';
import { useManifests } from './manifests.queries';

export default function ManifestsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const ownOffice = user?.role === 'office_agent' ? user.office?.id : undefined;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ManifestStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const q = useManifests({ page, status: status || undefined, officeId: ownOffice });

  return (
    <>
      <PageHeader
        title="Manifests"
        description="Parcels travelling between offices — by Estene vehicle or partner transport."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Open manifest
          </Button>
        }
      />
      <Card>
        <div className="flex justify-end border-b p-4">
          <Select
            className="w-44"
            aria-label="Status"
            placeholder="All manifests"
            options={MANIFEST_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ManifestStatus | '');
              setPage(1);
            }}
          />
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data?.items.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No manifests"
              description="Open one to send parcels to another office."
            />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Manifest</TH>
                      <TH>Route</TH>
                      <TH>Carrier</TH>
                      <TH className="text-right">Parcels</TH>
                      <TH>Status</TH>
                      <TH>Updated</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((m) => (
                      <TR key={m.id} className="hover:bg-muted/50">
                        <TD>
                          <Link
                            to={`/manifests/${m.id}`}
                            className="text-primary font-mono text-[13px] font-semibold hover:underline"
                          >
                            {m.code}
                          </Link>
                        </TD>
                        <TD className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {m.from.name} <ArrowRight className="text-muted-foreground size-3.5" />{' '}
                            {m.to.name}
                          </span>
                          <span className="text-muted-foreground block text-xs">
                            {m.from.city} → {m.to.city}
                          </span>
                        </TD>
                        <TD className="text-xs">
                          {m.carrier.type === 'partner' ? (
                            <>
                              {m.carrier.carrierName}
                              {m.carrier.waybillNumber && (
                                <span className="text-muted-foreground block">
                                  Waybill {m.carrier.waybillNumber}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              {m.carrier.vehiclePlate ?? 'Estene vehicle'}
                              {m.carrier.driverName && (
                                <span className="text-muted-foreground block">
                                  {m.carrier.driverName}
                                </span>
                              )}
                            </>
                          )}
                        </TD>
                        <TD className="tabular text-right">
                          {m.status === 'open' || m.status === 'in_transit'
                            ? m.counts.total
                            : `${m.counts.received}/${m.counts.total}`}
                        </TD>
                        <TD>
                          <ManifestStatusBadge status={m.status} />
                        </TD>
                        <TD className="text-muted-foreground whitespace-nowrap">
                          {formatRelativeDay(
                            m.closedAt ?? m.arrivedAt ?? m.departedAt ?? m.createdAt,
                          )}
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
      {creating && (
        <CreateManifestDialog
          fromOfficeId={ownOffice}
          onClose={() => setCreating(false)}
          onCreated={(m) => navigate(`/manifests/${m.id}`)}
        />
      )}
    </>
  );
}
