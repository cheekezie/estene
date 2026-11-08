import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import type { Paginated } from '@estene/contracts/common';
import { formatNaira } from '@estene/contracts/money';
import { STATEMENT_ENTRY_LABELS, type StatementEntryDto } from '@estene/contracts/portal';
import { formatDate } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { api } from '@/lib/api';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';

type Statement = { outstanding: number; entries: Paginated<StatementEntryDto> };

export default function StatementPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['statement', page],
    queryFn: () => api.get<Statement>('/portal/statement', { page, limit: 25 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Statement" description="What you’ve been charged and what you’ve paid." />
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {q.data && (
          <div className="space-y-6">
            <Card
              className={cn('p-5', q.data.outstanding > 0 && 'bg-accent-soft border-amber-300')}
            >
              <p className="text-muted-foreground text-sm">Balance due</p>
              <p className="font-display tabular mt-1 text-3xl font-bold">
                {formatNaira(q.data.outstanding)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Pay by bank transfer to the account on your invoice, quoting your business name.
              </p>
            </Card>
            <Card>
              {q.data.entries.items.length === 0 ? (
                <EmptyState icon={Receipt} title="Nothing on your statement yet" />
              ) : (
                <>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Date</TH>
                        <TH>Item</TH>
                        <TH>Reference</TH>
                        <TH className="text-right">Charge</TH>
                        <TH className="text-right">Paid</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {q.data.entries.items.map((e) => {
                        const paid = e.type === 'payment_received';
                        return (
                          <TR key={e.id}>
                            <TD className="text-muted-foreground whitespace-nowrap text-sm">
                              {formatDate(e.at)}
                            </TD>
                            <TD>
                              {STATEMENT_ENTRY_LABELS[e.type]}
                              {e.note && (
                                <span className="text-muted-foreground block text-xs">
                                  {e.note}
                                </span>
                              )}
                            </TD>
                            <TD className="font-mono text-sm">
                              {e.trackingNumber ?? e.reference ?? '—'}
                            </TD>
                            <TD className="tabular text-right">
                              {paid ? '' : formatNaira(e.amount)}
                            </TD>
                            <TD className="tabular text-success text-right">
                              {paid ? formatNaira(e.amount) : ''}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                  <Pagination
                    page={q.data.entries.page}
                    totalPages={q.data.entries.totalPages}
                    total={q.data.entries.total}
                    onPage={setPage}
                  />
                </>
              )}
            </Card>
          </div>
        )}
      </QueryState>
    </>
  );
}
