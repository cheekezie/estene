import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { toast } from 'sonner';
import type { Paginated } from '@estene/contracts/common';
import { humanize } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { Input } from '@estene/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { api } from '@/lib/api';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';

type Tag = { code: string; batch: string; status: 'available' | 'bound' | 'void'; order?: string };
const TONE = { available: 'success', bound: 'info', void: 'neutral' } as const;

export default function TagsPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [count, setCount] = useState('100');
  const tags = useQuery({ queryKey: ['tags', page], queryFn: () => api.get<Paginated<Tag>>('/tags', { page, limit: 25 }), placeholderData: keepPreviousData });
  const generate = useMutation({
    mutationFn: () => api.post<{ batch: string; codes: string[] }>('/tags/batches', { count: Number(count) }),
    onSuccess: ({ batch, codes }) => {
      toast.success(`Batch ${batch}: ${codes.length} tags ready to print`);
      void qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  return (
    <>
      <PageHeader
        title="Parcel tags"
        description="Pre-printed QR tags. Riders scan one onto each parcel at pickup and rescan it at delivery."
        actions={can('ops_manager') && (
          <div className="flex items-center gap-2">
            <Input className="w-24" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} aria-label="Number of tags" />
            <Button loading={generate.isPending} disabled={!(Number(count) > 0 && Number(count) <= 1000)} onClick={() => generate.mutate()}><QrCode />Generate batch</Button>
          </div>
        )}
      />
      <Card>
        <QueryState isLoading={tags.isLoading} error={tags.error} onRetry={tags.refetch}>
          {tags.data?.items.length === 0 ? (
            <EmptyState icon={QrCode} title="No tags yet" description="Generate a batch, print it, and hand rolls to riders." />
          ) : tags.data && (
            <>
              <Table>
                <THead><TR><TH>Code</TH><TH>Batch</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {tags.data.items.map((t) => (
                    <TR key={t.code}>
                      <TD className="font-mono font-medium">{t.code}</TD>
                      <TD className="font-mono text-xs text-muted-foreground">{t.batch}</TD>
                      <TD><Badge tone={TONE[t.status]}>{humanize(t.status)}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={tags.data.page} totalPages={tags.data.totalPages} total={tags.data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}
