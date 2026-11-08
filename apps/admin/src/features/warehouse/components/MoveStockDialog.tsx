import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { StockLevelDto } from '@estene/contracts/warehouse';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { useOffices } from '../../offices/offices.queries';
import { useStock, useTransferStock } from '../warehouse.queries';

/**
 * Moves a client's available units to another warehouse. They leave the
 * shelf now and arrive as an inbound at the destination, to be counted there.
 */
export function MoveStockDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const stock = useStock({ clientId, page: 1 });
  const offices = useOffices();
  const transfer = useTransferStock();
  const rows = useMemo(() => stock.data?.items ?? [], [stock.data]);

  const origins = useMemo(() => {
    const seen = new Map<string, StockLevelDto['office']>();
    for (const r of rows) if (r.available > 0) seen.set(r.office.id, r.office);
    return [...seen.values()];
  }, [rows]);
  const [fromId, setFromId] = useState('');
  const from = fromId || origins[0]?.id || '';
  const [toId, setToId] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  const lines = rows.filter((r) => r.office.id === from && r.available > 0);
  const destinations = (offices.data ?? []).filter(
    (o) => o.isActive && o.isWarehouse && o.id !== from,
  );
  const chosen = lines
    .map((r) => ({ productId: r.product.id, qty: Math.min(r.available, qty[r.product.id] ?? 0) }))
    .filter((l) => l.qty > 0);
  const units = chosen.reduce((n, l) => n + l.qty, 0);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title="Move stock to another warehouse"
        description="Units leave this shelf now and arrive as an inbound at the destination, where they are counted. Reserved units stay put."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            transfer.mutate(
              {
                clientId,
                fromOfficeId: from,
                toOfficeId: toId,
                lines: chosen,
                notes: notes.trim() || undefined,
              },
              {
                onSuccess: (inbound) => {
                  toast.success(`${units} units on their way as ${inbound.number}`);
                  onClose();
                },
              },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="From">
              <Select
                options={origins.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }))}
                value={from}
                onChange={(e) => {
                  setFromId(e.target.value);
                  setQty({});
                }}
              />
            </Field>
            <Field label="To">
              <Select
                placeholder="Choose a warehouse"
                options={destinations.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }))}
                value={toId}
                onChange={(e) => setToId(e.target.value)}
              />
            </Field>
          </div>

          {lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">No available units to move.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH className="text-right">Available</TH>
                    <TH className="text-right">Move</TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.map((r) => (
                    <TR key={r.product.id}>
                      <TD>
                        {r.product.name}
                        <span className="text-muted-foreground block font-mono text-xs">
                          {r.product.sku}
                        </span>
                      </TD>
                      <TD className="tabular text-right">{r.available}</TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Input
                            aria-label={`Units of ${r.product.name} to move`}
                            type="number"
                            min={0}
                            max={r.available}
                            className="w-20"
                            value={qty[r.product.id] ?? 0}
                            onChange={(e) =>
                              setQty((q) => ({
                                ...q,
                                [r.product.id]: Math.max(
                                  0,
                                  Math.min(r.available, Number(e.target.value) || 0),
                                ),
                              }))
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setQty((q) => ({ ...q, [r.product.id]: r.available }))}
                          >
                            All
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}

          <Field label="Note (optional)" hint="e.g. the vehicle or waybill carrying it.">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
          </Field>

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!toId || units === 0} loading={transfer.isPending}>
              Move {units || ''} unit{units === 1 ? '' : 's'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
