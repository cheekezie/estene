import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { PAYMENT_METHOD_LABELS, SERVICE_LEVEL_META } from '@estene/contracts/enums';
import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { CANCELLABLE_ORDER_STATUSES, ORDER_STATUS_META } from '@estene/contracts/warehouse';
import { formatDateTime } from '@estene/lib/date';
import { formatPhone } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { BackLink } from '@/shared/components/BackLink';
import { OrderStatusBadge } from '@/shared/components/OrderStatusBadge';
import { QueryState } from '@/shared/components/QueryState';
import { useCancelOrder, useOrder } from './orders.queries';

export default function OrderDetailPage() {
  const { ref = '' } = useParams();
  const q = useOrder(ref);
  const cancel = useCancelOrder(ref);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const o = q.data;
  // A packed order can still be unpacked while it waits at the warehouse with no rider.
  const canCancel =
    o &&
    (CANCELLABLE_ORDER_STATUSES.includes(o.status) ||
      (o.status === 'shipped' && o.shipment?.status === 'at_hub'));

  return (
    <>
      <BackLink to="/orders" label="Orders" />
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
                  Ships from {o.office.name}
                  {o.reference && ` · your ref ${o.reference}`}
                </p>
              </div>
              {canCancel && (
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

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <div className="space-y-6">
                <Card>
                  <div className="border-b px-5 py-3">
                    <h2 className="font-semibold">Items</h2>
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Product</TH>
                        <TH className="text-right">Qty</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {o.lines.map((l) => (
                        <TR key={l.product.id}>
                          <TD>
                            {l.product.name}
                            <span className="text-muted-foreground block font-mono text-xs">
                              {l.product.sku}
                            </span>
                          </TD>
                          <TD className="tabular text-right font-semibold">{l.qty}</TD>
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
                          <p className="text-muted-foreground text-xs">{formatDateTime(e.at)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>
              <div className="space-y-6">
                {o.shipment && (
                  <Card className="p-5">
                    <h2 className="mb-2 font-semibold">Delivery</h2>
                    <Link
                      to={`/deliveries/${o.shipment.trackingNumber}`}
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
                  <p className="text-muted-foreground">
                    {o.deliveryMode === 'collection'
                      ? `Collects at ${o.destinationOffice?.name}`
                      : `${o.recipient.address}, ${o.recipient.area}${o.recipient.landmark ? ` (${o.recipient.landmark})` : ''}`}
                  </p>
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

            <Dialog open={cancelling} onOpenChange={setCancelling}>
              <DialogContent
                title={`Cancel ${o.number}?`}
                description="Reserved stock goes back to available. This can’t be undone."
              >
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    cancel.mutate(reason.trim() || undefined, {
                      onSuccess: () => {
                        toast.success('Order cancelled');
                        setCancelling(false);
                      },
                    });
                  }}
                >
                  <Field label="Reason (optional)">
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={300}
                    />
                  </Field>
                  <div className="flex justify-end gap-2 border-t pt-4">
                    <Button type="button" variant="outline" onClick={() => setCancelling(false)}>
                      Keep order
                    </Button>
                    <Button type="submit" variant="destructive" loading={cancel.isPending}>
                      Cancel order
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </QueryState>
    </>
  );
}
