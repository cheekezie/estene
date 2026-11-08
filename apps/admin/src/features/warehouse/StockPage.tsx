import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRightLeft, Boxes, History, MapPin, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { STOCK_MOVEMENT_LABELS, type StockLevelDto } from '@estene/contracts/warehouse';
import { formatRelativeDay } from '@estene/lib/date';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { EmptyState } from '@estene/ui/EmptyState';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { Textarea } from '@estene/ui/textarea';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { ClientPicker } from './components/ClientPicker';
import { MoveStockDialog } from './components/MoveStockDialog';
import {
  useAdjustStock,
  useMovements,
  useSelectedClient,
  useSetBin,
  useStock,
} from './warehouse.queries';

export default function StockPage() {
  const can = useCan();
  const canEdit = can('ops_manager', 'office_agent');
  const [clientId, setClientId] = useSelectedClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const debounced = useDebounce(search, 300);
  const q = useStock({ clientId, page, search: debounced || undefined, lowOnly });
  const [adjusting, setAdjusting] = useState<StockLevelDto | null>(null);
  const [binFor, setBinFor] = useState<StockLevelDto | null>(null);
  const [historyFor, setHistoryFor] = useState<StockLevelDto | null>(null);
  const [moving, setMoving] = useState(false);

  return (
    <>
      <PageHeader
        title="Stock"
        description="What each warehousing client has on our shelves. Reserved units belong to orders not yet packed."
        actions={
          clientId && (
            <>
              {canEdit && (
                <Button variant="outline" onClick={() => setMoving(true)}>
                  <ArrowRightLeft />
                  Move stock
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link to={`/clients/${clientId}/warehousing`}>Products & settings</Link>
              </Button>
            </>
          )
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <ClientPicker
            value={clientId}
            onChange={(id) => {
              setClientId(id);
              setPage(1);
            }}
          />
          <Input
            className="w-56"
            placeholder="Search SKU or name"
            aria-label="Search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            disabled={!clientId}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={lowOnly}
              onChange={(e) => {
                setLowOnly(e.target.checked);
                setPage(1);
              }}
              disabled={!clientId}
            />
            Low stock only
          </label>
        </div>
        {!clientId ? (
          <EmptyState
            icon={Boxes}
            title="Choose a client"
            description="Pick a warehousing client to see their stock."
          />
        ) : (
          <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
            {q.data?.items.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="Nothing on the shelf"
                description="Stock appears here once an inbound delivery is received."
              />
            ) : (
              q.data && (
                <>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Product</TH>
                        <TH>Bin</TH>
                        <TH className="text-right">On hand</TH>
                        <TH className="text-right">Reserved</TH>
                        <TH className="text-right">Available</TH>
                        <TH>Updated</TH>
                        <TH className="w-0" />
                      </TR>
                    </THead>
                    <TBody>
                      {q.data.items.map((s) => (
                        <TR key={`${s.product.id}:${s.office.id}`}>
                          <TD>
                            <span className="font-medium">{s.product.name}</span>
                            <span className="text-muted-foreground block font-mono text-xs">
                              {s.product.sku}
                              {!s.product.isActive && ' · inactive'}
                            </span>
                          </TD>
                          <TD>
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => setBinFor(s)}
                              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-mono text-xs disabled:pointer-events-none"
                            >
                              <MapPin className="size-3" />
                              {s.bin ?? (canEdit ? 'Set bin' : '—')}
                            </button>
                          </TD>
                          <TD className="tabular text-right">{s.onHand}</TD>
                          <TD className="tabular text-muted-foreground text-right">{s.reserved}</TD>
                          <TD className="tabular text-right font-semibold">
                            {s.low ? (
                              <Badge tone="warning">{s.available} · low</Badge>
                            ) : (
                              s.available
                            )}
                          </TD>
                          <TD className="text-muted-foreground whitespace-nowrap">
                            {formatRelativeDay(s.updatedAt)}
                          </TD>
                          <TD className="whitespace-nowrap text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="History"
                              onClick={() => setHistoryFor(s)}
                            >
                              <History />
                            </Button>
                            {canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Adjust"
                                onClick={() => setAdjusting(s)}
                              >
                                <SlidersHorizontal />
                              </Button>
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
        )}
      </Card>
      {adjusting && <AdjustDialog level={adjusting} onClose={() => setAdjusting(null)} />}
      {binFor && <BinDialog level={binFor} onClose={() => setBinFor(null)} />}
      {historyFor && <HistoryDialog level={historyFor} onClose={() => setHistoryFor(null)} />}
      {moving && clientId && (
        <MoveStockDialog clientId={clientId} onClose={() => setMoving(false)} />
      )}
    </>
  );
}

function AdjustDialog({ level, onClose }: { level: StockLevelDto; onClose: () => void }) {
  const adjust = useAdjustStock();
  const [delta, setDelta] = useState('');
  const [type, setType] = useState<'adjusted' | 'written_off'>('adjusted');
  const [reason, setReason] = useState('');
  const n = Number(delta);
  const signed = type === 'written_off' ? -Math.abs(n) : n;
  const valid = Number.isInteger(n) && n !== 0 && reason.trim().length >= 5;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Adjust ${level.product.name}`}
        description={`${level.onHand} on hand · ${level.reserved} reserved for orders`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            adjust.mutate(
              {
                productId: level.product.id,
                officeId: level.office.id,
                delta: signed,
                type,
                reason,
              },
              {
                onSuccess: () => {
                  toast.success('Stock adjusted');
                  onClose();
                },
              },
            );
          }}
        >
          <Field label="What happened">
            <Select
              options={[
                { value: 'adjusted', label: 'Recount — correct the number' },
                { value: 'written_off', label: 'Damaged or lost — write off' },
              ]}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            />
          </Field>
          <Field
            label={type === 'written_off' ? 'Units to write off' : 'Change'}
            hint={
              type === 'written_off'
                ? undefined
                : 'Use a minus sign to remove, e.g. -2. Reserved units can’t be removed.'
            }
          >
            <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </Field>
          {Number.isInteger(n) && n !== 0 && (
            <p className="text-muted-foreground text-sm">
              On hand: {level.onHand} →{' '}
              <span className="text-foreground font-semibold">{level.onHand + signed}</span>
            </p>
          )}
          <Field label="Reason" hint="Kept on the stock history.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid} loading={adjust.isPending}>
              Save adjustment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BinDialog({ level, onClose }: { level: StockLevelDto; onClose: () => void }) {
  const save = useSetBin();
  const [bin, setBin] = useState(level.bin ?? '');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Bin for ${level.product.name}`}
        description="Shown on pick lists so packers find it fast."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              { productId: level.product.id, officeId: level.office.id, bin: bin.trim() || null },
              { onSuccess: onClose },
            );
          }}
        >
          <Field label="Bin / shelf">
            <Input
              className="uppercase"
              placeholder="A-03-2"
              maxLength={20}
              value={bin}
              onChange={(e) => setBin(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ level, onClose }: { level: StockLevelDto; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const q = useMovements({ productId: level.product.id, page });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl"
        title={`${level.product.name} history`}
        description={level.product.sku}
      >
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Movement</TH>
                    <TH className="text-right">Change</TH>
                    <TH className="text-right">After</TH>
                    <TH>By</TH>
                  </TR>
                </THead>
                <TBody>
                  {q.data.items.map((m) => (
                    <TR key={m.id}>
                      <TD className="text-muted-foreground whitespace-nowrap">
                        {formatRelativeDay(m.at)}
                      </TD>
                      <TD>
                        {STOCK_MOVEMENT_LABELS[m.type]}
                        {m.reference && (
                          <span className="text-muted-foreground font-mono text-xs">
                            {' '}
                            · {m.reference}
                          </span>
                        )}
                        {m.note && (
                          <span className="text-muted-foreground block text-xs">{m.note}</span>
                        )}
                      </TD>
                      <TD
                        className={`tabular text-right font-medium ${m.qty < 0 ? 'text-destructive' : 'text-success'}`}
                      >
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </TD>
                      <TD className="tabular text-right">{m.onHandAfter}</TD>
                      <TD className="text-muted-foreground">{m.by}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {q.data.totalPages > 1 && (
                <Pagination
                  page={q.data.page}
                  totalPages={q.data.totalPages}
                  total={q.data.total}
                  onPage={setPage}
                />
              )}
            </>
          )}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}
