import { useState } from 'react';
import { Boxes, History } from 'lucide-react';
import { STOCK_MOVEMENT_LABELS } from '@estene/contracts/warehouse';
import { formatDateTime, formatRelativeDay } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { EmptyState } from '@estene/ui/EmptyState';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { Input } from '@estene/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useMovements, useStock } from './stock.queries';

export default function StockPage() {
  const [tab, setTab] = useState<'levels' | 'history'>('levels');
  return (
    <>
      <PageHeader
        title="Stock"
        description="What we hold for you. Available = on the shelf minus units reserved for orders."
        actions={
          <div className="flex gap-1 rounded-lg border p-1">
            {(['levels', 'history'] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tab === t ? 'primary' : 'ghost'}
                onClick={() => setTab(t)}
              >
                {t === 'levels' ? <Boxes /> : <History />}
                {t === 'levels' ? 'Levels' : 'History'}
              </Button>
            ))}
          </div>
        }
      />
      {tab === 'levels' ? <Levels /> : <Movements />}
    </>
  );
}

function Levels() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const debounced = useDebounce(search, 300);
  const q = useStock({ page, search: debounced || undefined, lowOnly });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <Input
          className="max-w-xs"
          placeholder="Search SKU or name"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => {
              setLowOnly(e.target.checked);
              setPage(1);
            }}
          />
          Running low only
        </label>
      </div>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {q.data && q.data.items.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No stock here yet"
            description="Book an inbound and send us your goods — they appear here once counted."
          />
        ) : (
          q.data && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH>Warehouse</TH>
                    <TH className="text-right">On shelf</TH>
                    <TH className="text-right">Reserved</TH>
                    <TH className="text-right">Available</TH>
                    <TH>Updated</TH>
                  </TR>
                </THead>
                <TBody>
                  {q.data.items.map((s) => (
                    <TR key={`${s.product.id}:${s.office.id}`}>
                      <TD>
                        {s.product.name}
                        <span className="text-muted-foreground block font-mono text-xs">
                          {s.product.sku}
                        </span>
                      </TD>
                      <TD className="text-sm">{s.office.code}</TD>
                      <TD className="tabular text-right">{s.onHand}</TD>
                      <TD className="tabular text-muted-foreground text-right">{s.reserved}</TD>
                      <TD className="text-right">
                        <span className={cn('tabular font-semibold', s.low && 'text-warning')}>
                          {s.available}
                        </span>
                        {s.low && (
                          <Badge tone="warning" className="ml-2">
                            Low
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-muted-foreground text-sm">
                        {formatRelativeDay(s.updatedAt)}
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
  );
}

function Movements() {
  const [page, setPage] = useState(1);
  const q = useMovements(page);
  return (
    <Card>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {q.data && q.data.items.length === 0 ? (
          <EmptyState icon={History} title="No stock movements yet" />
        ) : (
          q.data && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Product</TH>
                    <TH>What</TH>
                    <TH className="text-right">Change</TH>
                    <TH className="text-right">On shelf after</TH>
                  </TR>
                </THead>
                <TBody>
                  {q.data.items.map((m) => (
                    <TR key={m.id}>
                      <TD className="text-muted-foreground whitespace-nowrap text-sm">
                        {formatDateTime(m.at)}
                      </TD>
                      <TD>
                        {m.product.name}
                        <span className="text-muted-foreground block font-mono text-xs">
                          {m.product.sku} · {m.office.code}
                        </span>
                      </TD>
                      <TD className="text-sm">
                        {STOCK_MOVEMENT_LABELS[m.type]}
                        {(m.reference || m.note) && (
                          <span className="text-muted-foreground block text-xs">
                            {[m.reference, m.note].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </TD>
                      <TD
                        className={cn(
                          'tabular text-right font-semibold',
                          m.qty > 0 ? 'text-success' : 'text-destructive',
                        )}
                      >
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </TD>
                      <TD className="tabular text-right">{m.onHandAfter}</TD>
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
  );
}
