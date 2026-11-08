import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  ClipboardList,
  MapPin,
  PackageCheck,
  Printer,
  RotateCcw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  PARCEL_SIZES,
  PARCEL_SIZE_META,
  SERVICE_LEVEL_META,
  PAYMENT_METHOD_LABELS,
  type ParcelSize,
} from '@estene/contracts/enums';
import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import {
  CANCELLABLE_ORDER_STATUSES,
  ORDER_STATUS_META,
  type OrderDto,
} from '@estene/contracts/warehouse';
import { formatDateTime } from '@estene/lib/date';
import { formatPhone, humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { QueryState } from '@/shared/components/QueryState';
import { ReasonDialog } from '@/shared/components/ReasonDialog';
import { useCan } from '@/shared/hooks/useCan';
import { OrderStatusBadge } from './components/OrderStatusBadge';
import {
  useCancelOrder,
  useOrder,
  usePackOrder,
  useRestockOrder,
  useStartPicking,
} from './warehouse.queries';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const q = useOrder(id);
  const can = useCan();
  const floor = can('ops_manager', 'office_agent');
  const pick = useStartPicking(id);
  const cancel = useCancelOrder(id);
  const [packing, setPacking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [restocking, setRestocking] = useState(false);
  const o = q.data;

  return (
    <>
      <Link
        to="/warehouse/orders"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Warehouse orders
      </Link>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {o && (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-display font-mono text-2xl font-bold">{o.number}</h1>
                  <OrderStatusBadge status={o.status} />
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {o.client.name} · ships from {o.office.name} ({o.office.code})
                  {o.reference && ` · ref ${o.reference}`} · via {o.source}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <a href={`/warehouse/orders/${o.id}/print`} target="_blank" rel="noreferrer">
                    <Printer />
                    Pick list & slip
                  </a>
                </Button>
                {floor && o.status === 'ready_to_pick' && (
                  <Button
                    variant="outline"
                    loading={pick.isPending}
                    onClick={() =>
                      pick.mutate(undefined, { onSuccess: () => toast.success('Picking started') })
                    }
                  >
                    <ClipboardList />
                    Start picking
                  </Button>
                )}
                {floor && (o.status === 'ready_to_pick' || o.status === 'picking') && (
                  <Button onClick={() => setPacking(true)}>
                    <PackageCheck />
                    Pack & hand in
                  </Button>
                )}
                {floor && o.status === 'returned' && !o.restockedAt && (
                  <Button onClick={() => setRestocking(true)}>
                    <RotateCcw />
                    Process return
                  </Button>
                )}
                {can('ops_manager', 'office_agent', 'support') &&
                  (CANCELLABLE_ORDER_STATUSES.includes(o.status) ||
                    (o.status === 'shipped' && o.shipment?.status === 'at_hub')) && (
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setCancelling(true)}
                    >
                      <X />
                      Cancel order
                    </Button>
                  )}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <div className="space-y-6">
                <Card>
                  <div className="border-b px-5 py-3">
                    <h2 className="font-semibold">
                      {o.status === 'picking' || o.status === 'ready_to_pick'
                        ? 'Pick list'
                        : 'Items'}
                    </h2>
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Bin</TH>
                        <TH>Product</TH>
                        <TH className="text-right">Qty</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {o.lines.map((l) => (
                        <TR key={l.product.id}>
                          <TD className="font-mono text-sm">
                            {l.bin ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="text-muted-foreground size-3" />
                                {l.bin}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TD>
                          <TD>
                            {l.product.name}
                            <span className="text-muted-foreground block font-mono text-xs">
                              {l.product.sku}
                            </span>
                          </TD>
                          <TD className="tabular text-right text-base font-semibold">{l.qty}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Card>

                <Card className="p-5">
                  <h2 className="mb-4 font-semibold">Timeline</h2>
                  <ol className="space-y-3">
                    {[...o.events].reverse().map((e, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span
                          className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                          aria-hidden
                        />
                        <div>
                          <p className="font-medium">{ORDER_STATUS_META[e.status].label}</p>
                          {e.note && <p className="text-muted-foreground">{e.note}</p>}
                          <p className="text-muted-foreground text-xs">
                            {formatDateTime(e.at)} · {humanize(e.actor)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>

              <div className="space-y-6">
                {o.shipment && (
                  <Card className="p-5">
                    <h2 className="mb-2 font-semibold">Shipment</h2>
                    <Link
                      to={`/shipments/${o.shipment.id}`}
                      className="text-primary font-mono font-semibold hover:underline"
                    >
                      {o.shipment.trackingNumber}
                    </Link>
                    <p className="text-muted-foreground text-sm">
                      {SHIPMENT_STATUS_META[o.shipment.status].label}
                    </p>
                  </Card>
                )}
                <Card className="space-y-3 p-5 text-sm">
                  <h2 className="font-semibold">Recipient</h2>
                  <p>
                    {o.recipient.contactName}
                    <span className="text-muted-foreground block">
                      {formatPhone(o.recipient.phone)}
                    </span>
                  </p>
                  {o.deliveryMode === 'collection' ? (
                    <p className="text-muted-foreground">Collects at {o.destinationOffice?.name}</p>
                  ) : (
                    <p className="text-muted-foreground">
                      {o.recipient.address}, {o.recipient.area}
                      {o.recipient.landmark && ` (${o.recipient.landmark})`}
                    </p>
                  )}
                  <dl className="grid grid-cols-2 gap-2 border-t pt-3">
                    <dt className="text-muted-foreground">Service</dt>
                    <dd>{SERVICE_LEVEL_META[o.serviceLevel].label}</dd>
                    <dt className="text-muted-foreground">Delivery fee</dt>
                    <dd>{PAYMENT_METHOD_LABELS[o.paymentMethod]}</dd>
                  </dl>
                  {o.notes && <p className="border-t pt-3">{o.notes}</p>}
                </Card>
              </div>
            </div>

            {packing && <PackDialog order={o} onClose={() => setPacking(false)} />}
            {restocking && <RestockDialog order={o} onClose={() => setRestocking(false)} />}
            <ReasonDialog
              open={cancelling}
              onOpenChange={setCancelling}
              title={`Cancel ${o.number}?`}
              description={
                o.status === 'shipped'
                  ? 'The parcel is unpacked: its shipment is cancelled and the items go back on the shelf. This only works before a rider takes it.'
                  : 'Reserved stock goes back to available.'
              }
              confirmLabel="Cancel order"
              loading={cancel.isPending}
              onConfirm={(reason) =>
                cancel.mutate(reason, {
                  onSuccess: () => {
                    toast.success('Order cancelled');
                    setCancelling(false);
                  },
                })
              }
            />
          </>
        )}
      </QueryState>
    </>
  );
}

/** Scan a fresh tag and weigh the parcel: this creates the shipment and accepts it at the counter. */
function PackDialog({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const pack = usePackOrder(order.id);
  const [tagCode, setTagCode] = useState('');
  const [size, setSize] = useState<ParcelSize>(order.suggestedParcel.size);
  const [weight, setWeight] = useState(String(order.suggestedParcel.weightKg));
  const kg = Number(weight);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Pack ${order.number}`}
        description="Tag the parcel and confirm its size and weight. It joins the counter as dropped off here."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            pack.mutate(
              { tagCode: tagCode.trim().toUpperCase(), size, weightKg: kg },
              {
                onSuccess: (o) => {
                  toast.success(`Handed in as ${o.shipment?.trackingNumber}`);
                  onClose();
                },
              },
            );
          }}
        >
          <Field label="QR tag" hint="Scan or type the code on a fresh tag.">
            <Input
              autoFocus
              className="font-mono uppercase"
              value={tagCode}
              onChange={(e) => setTagCode(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Size">
              <Select
                options={PARCEL_SIZES.map((s) => ({ value: s, label: PARCEL_SIZE_META[s].label }))}
                value={size}
                onChange={(e) => setSize(e.target.value as ParcelSize)}
              />
            </Field>
            <Field
              label="Weight (kg)"
              hint={`Items weigh about ${order.suggestedParcel.weightKg} kg`}
            >
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={tagCode.trim().length < 6 || !(kg > 0)}
              loading={pack.isPending}
            >
              Pack & hand in
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Every returned unit is either back on the shelf or written off. */
function RestockDialog({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const restock = useRestockOrder(order.id);
  const [writeOff, setWriteOff] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Process return · ${order.number}`}
        description="Check each item. Damaged units are written off; the rest go back on the shelf."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            restock.mutate(
              {
                note: note.trim() || undefined,
                lines: order.lines.map((l) => {
                  const off = Math.min(l.qty, writeOff[l.product.id] ?? 0);
                  return { productId: l.product.id, restockQty: l.qty - off, writeOffQty: off };
                }),
              },
              {
                onSuccess: () => {
                  toast.success('Return processed');
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
                <TH className="text-right">Returned</TH>
                <TH className="text-right">Damaged</TH>
              </TR>
            </THead>
            <TBody>
              {order.lines.map((l) => (
                <TR key={l.product.id}>
                  <TD>{l.product.name}</TD>
                  <TD className="tabular text-right">{l.qty}</TD>
                  <TD className="text-right">
                    <Input
                      aria-label={`Damaged ${l.product.name}`}
                      type="number"
                      min={0}
                      max={l.qty}
                      className="ml-auto w-20"
                      value={writeOff[l.product.id] ?? 0}
                      onChange={(e) =>
                        setWriteOff((w) => ({
                          ...w,
                          [l.product.id]: Math.max(0, Math.min(l.qty, Number(e.target.value) || 0)),
                        }))
                      }
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={restock.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
