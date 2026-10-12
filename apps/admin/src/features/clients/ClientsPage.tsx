import { useState } from 'react';
import { Link } from 'react-router';
import { Building2, Plus, Search, Webhook } from 'lucide-react';
import {
  CLIENT_INDUSTRIES,
  CLIENT_INDUSTRY_LABELS,
  type ClientIndustry,
} from '@estene/contracts/client';
import { formatPhone } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
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
import { useClients } from './clients.queries';

export default function ClientsPage() {
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState<ClientIndustry | ''>('');
  const debounced = useDebounce(search.trim());
  const q = useClients({ page, search: debounced || undefined, industry: industry || undefined });

  return (
    <>
      <PageHeader
        title="Business clients"
        description="Merchants and companies that send with us — by phone or through the API."
        actions={
          can('ops_manager') && (
            <Button asChild>
              <Link to="/clients/new">
                <Plus />
                New client
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Business, contact, email, phone or CAC number"
              className="pl-9"
              aria-label="Search clients"
            />
          </div>
          <Select
            className="w-60"
            aria-label="Industry"
            placeholder="All industries"
            options={CLIENT_INDUSTRIES.map((i) => ({ value: i, label: CLIENT_INDUSTRY_LABELS[i] }))}
            value={industry}
            onChange={(e) => {
              setIndustry(e.target.value as ClientIndustry | '');
              setPage(1);
            }}
          />
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data?.items.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No business clients found"
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
                      <TH>Location</TH>
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
                            <p className="text-muted-foreground text-xs">
                              {CLIENT_INDUSTRY_LABELS[c.industry]}
                            </p>
                          </TD>
                          <TD>
                            <p>
                              {c.contact.name}
                              {c.contact.role && (
                                <span className="text-muted-foreground"> · {c.contact.role}</span>
                              )}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {formatPhone(c.contact.phone)} · {c.contact.email}
                            </p>
                          </TD>
                          <TD className="text-muted-foreground">
                            {c.address.area ?? c.address.city}
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
    </>
  );
}
