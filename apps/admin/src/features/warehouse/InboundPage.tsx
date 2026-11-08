import { useState } from 'react';
import { PackagePlus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { INBOUND_STATUSES, type InboundDto, type InboundStatus } from '@estene/contracts/warehouse';
import { formatDate, formatRelativeDay } from '@estene/lib/date';
import { humanize } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { EmptyState } from '@estene/ui/EmptyState';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { ClientPicker } from './components/ClientPicker';
import { LinesEditor, type Line } from './components/LinesEditor';
import {
  useCancelInbound,
  useCreateInbound,
  useInbounds,
  useProductOptions,
  useReceiveInbound,
  useSelectedClient,
} from './warehouse.queries';

const TONE = { expected: 'info', received: 'success', cancelled: 'neutral' } as const;

export default function InboundPage() {
  const can = useCan();
  const [clientId, setClientId] = useSelectedClient();
  const [status, setStatus] = useState<InboundStatus | ''>('expected');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<InboundDto | null>(null);
  const q = useInbounds({ clientId: clientId || undefined, status: status || undefined, page });

  return (
    <>
      <PageHeader
        title="Inbound"
        description="Stock clients are sending us. Count each delivery in — good units go straight on the shelf."
        actions={
          can('ops_manager', 'office_agent', 'support') && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Expect a delivery
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <ClientPicker
            value={clientId}
            placeholder="All clients"
            onChange={(id) => {
              setClientId(id);
              setPage(1);
            }}
          />
          <Select
            className="w-44"
            aria-label="Status"
            placeholder="Any status"
            options={INBOUND_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as InboundStatus | '');
              setPage(1);
            }}
          />
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data?.items.length === 0 ? (
            <EmptyState
              icon={PackagePlus}
              title="No deliveries"
              description="Nothing matches these filters."
            />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Inbound</TH>
                      <TH>Client</TH>
                      <TH className="text-right">Units</TH>
                      <TH>Status</TH>
                      <TH>Expected</TH>
                      <TH className="w-0" />
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((i) => {
                      const expected = i.lines.reduce((n, l) => n + l.expectedQty, 0);
                      const received = i.lines.reduce((n, l) => n + l.receivedQty, 0);
                      const damaged = i.lines.reduce((n, l) => n + l.damagedQty, 0);
                      return (
                        <TR key={i.id}>
                          <TD>
                            <span className="font-mono text-[13px] font-semibold">{i.number}</span>
                            {i.reference && (
                              <span className="text-muted-foreground block font-mono text-xs">
                                {i.reference}
                              </span>
                            )}
                          </TD>
                          <TD>
                            {i.client.name}
                            <span className="text-muted-foreground block text-xs">
                              {i.lines.length} product{i.lines.length === 1 ? '' : 's'} ·{' '}
                              {i.transferFrom ? `${i.transferFrom.code} → ` : ''}
                              {i.office.code}
                            </span>
                            {i.transferFrom && (
                              <Badge tone="info" className="mt-1">
                                Transfer
                              </Badge>
                            )}
                          </TD>
                          <TD className="tabular text-right">
                            {i.status === 'received' ? (
                              <>
                                {received}/{expected}
                                {damaged > 0 && (
                                  <span className="text-destructive block text-xs">
                                    {damaged} damaged
                                  </span>
                                )}
                              </>
                            ) : (
                              expected
                            )}
                          </TD>
                          <TD>
                            <Badge tone={TONE[i.status]}>{humanize(i.status)}</Badge>
                          </TD>
                          <TD className="text-muted-foreground whitespace-nowrap">
                            {i.receivedAt
                              ? `Received ${formatRelativeDay(i.receivedAt)}`
                              : i.expectedAt
                                ? formatDate(i.expectedAt)
                                : '—'}
                          </TD>
                          <TD className="text-right">
                            {i.status === 'expected' && can('ops_manager', 'office_agent') && (
                              <Button size="sm" onClick={() => setReceiving(i)}>
                                Receive
                              </Button>
                            )}
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
      {creating && <ExpectDialog initialClientId={clientId} onClose={() => setCreating(false)} />}
      {receiving && <ReceiveDialog inbound={receiving} onClose={() => setReceiving(null)} />}
    </>
  );
}

function ExpectDialog({
  initialClientId,
  onClose,
}: {
  initialClientId: string;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const products = useProductOptions(clientId);
  const create = useCreateInbound();
  const [lines, setLines] = useState<Line[]>([{ productId: '', qty: 1 }]);
  const [reference, setReference] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const valid = clientId && lines.some((l) => l.productId);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-xl"
        title="Expect a delivery"
        description="List what the client is sending so the warehouse can count it in."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              {
                clientId,
                reference: reference.trim() || undefined,
                expectedAt: expectedAt || undefined,
                lines: lines
                  .filter((l) => l.productId)
                  .map((l) => ({ productId: l.productId, expectedQty: l.qty })),
              },
              {
                onSuccess: (i) => {
                  toast.success(`${i.number} expected`);
                  onClose();
                },
              },
            );
          }}
        >
          <Field label="Client">
            <ClientPicker className="w-full" value={clientId} onChange={setClientId} />
          </Field>
          {clientId && (
            <>
              {products.data?.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Add this client’s products first (Client → Warehousing).
                </p>
              ) : (
                <LinesEditor products={products.data ?? []} lines={lines} onChange={setLines} />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Their reference (optional)">
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    maxLength={64}
                  />
                </Field>
                <Field label="Arriving (optional)">
                  <Input
                    type="date"
                    value={expectedAt}
                    onChange={(e) => setExpectedAt(e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid} loading={create.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ inbound, onClose }: { inbound: InboundDto; onClose: () => void }) {
  const receive = useReceiveInbound(inbound.id);
  const cancel = useCancelInbound(inbound.id);
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(
      inbound.lines.map((l) => [l.product.id, { good: l.expectedQty, damaged: 0 }]),
    ),
  );
  const setCount = (id: string, patch: Partial<{ good: number; damaged: number }>) =>
    setCounts((c) => ({ ...c, [id]: { ...c[id]!, ...patch } }));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-xl"
        title={`Receive ${inbound.number}`}
        description={`${inbound.client.name} — count what actually arrived.`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            receive.mutate(
              {
                lines: inbound.lines.map((l) => ({
                  productId: l.product.id,
                  receivedQty: counts[l.product.id]!.good,
                  damagedQty: counts[l.product.id]!.damaged,
                })),
              },
              {
                onSuccess: () => {
                  toast.success('Stock received');
                  onClose();
                },
              },
            );
          }}
        >
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH className="text-right">Expected</TH>
                <TH className="text-right">Good</TH>
                <TH className="text-right">Damaged</TH>
              </TR>
            </THead>
            <TBody>
              {inbound.lines.map((l) => (
                <TR key={l.product.id}>
                  <TD>
                    {l.product.name}
                    <span className="text-muted-foreground block font-mono text-xs">
                      {l.product.sku}
                    </span>
                  </TD>
                  <TD className="tabular text-right">{l.expectedQty}</TD>
                  {(['good', 'damaged'] as const).map((k) => (
                    <TD key={k} className="text-right">
                      <Input
                        aria-label={`${k} ${l.product.name}`}
                        type="number"
                        min={0}
                        className="ml-auto w-20"
                        value={counts[l.product.id]![k]}
                        onChange={(e) =>
                          setCount(l.product.id, { [k]: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="flex justify-between gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              loading={cancel.isPending}
              onClick={() => cancel.mutate(undefined, { onSuccess: onClose })}
            >
              It’s not coming
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={receive.isPending}>
                Put on shelf
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
