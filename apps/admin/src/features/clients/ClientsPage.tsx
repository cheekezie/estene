import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, Plus, Search, Webhook } from 'lucide-react';
import { formatPhone } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Input } from '@estene/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { ClientFormDialog } from './components/ClientFormDialog';
import { useClients } from './clients.queries';

export default function ClientsPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(search.trim());
  const q = useClients({ page, search: debounced || undefined });

  return (
    <>
      <PageHeader
        title="Business clients"
        description="Merchants and companies that send with us — by phone or through the API."
        actions={
          can('ops_manager') && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New client
            </Button>
          )
        }
      />
      <Card>
        <div className="border-b p-4">
          <div className="relative max-w-md">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Business, contact, email or phone"
              className="pl-9"
              aria-label="Search clients"
            />
          </div>
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data?.items.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No business clients yet"
              description="Add a business to book on their behalf, bill on account, or give them API access."
            />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Business</TH>
                      <TH>Contact</TH>
                      <TH>Integration</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((c) => {
                      const liveKeys = c.apiKeys.filter((k) => !k.revokedAt).length;
                      return (
                        <TR key={c.id} className="hover:bg-muted/50">
                          <TD>
                            <Link
                              to={`/clients/${c.id}`}
                              className="text-primary font-medium hover:underline"
                            >
                              {c.name}
                            </Link>
                          </TD>
                          <TD>
                            <p>{c.contactName}</p>
                            <p className="text-muted-foreground text-xs">
                              {formatPhone(c.phone)} · {c.email}
                            </p>
                          </TD>
                          <TD>
                            <div className="flex flex-wrap gap-1.5">
                              {liveKeys > 0 ? (
                                <Badge tone="info">
                                  {liveKeys} API {liveKeys === 1 ? 'key' : 'keys'}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">Phone only</span>
                              )}
                              {c.webhook?.isActive && (
                                <Badge tone="success">
                                  <Webhook className="size-3" />
                                  Webhook
                                </Badge>
                              )}
                            </div>
                          </TD>
                          <TD>
                            <Badge tone={c.status === 'active' ? 'success' : 'error'}>
                              {c.status === 'active' ? 'Active' : 'Suspended'}
                            </Badge>
                          </TD>
                        </TR>
                      );
                    })}
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
        <ClientFormDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => navigate(`/clients/${c.id}`)}
        />
      )}
    </>
  );
}
