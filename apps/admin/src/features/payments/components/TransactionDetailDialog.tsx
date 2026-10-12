import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { PAYMENT_METHOD_LABELS } from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import { formatDateTime } from '@estene/lib/date';
import { formatPhone, humanize } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { QueryState } from '@/shared/components/QueryState';
import { useCan } from '@/shared/hooks/useCan';
import { useRequery, useSimulateTransfer, useTransaction } from '../payments.queries';
import { ChannelLabel, TransactionStatusBadge } from './TransactionBadges';

export function TransactionDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const q = useTransaction(id);
  const requery = useRequery();
  const simulate = useSimulateTransfer();
  const can = useCan();
  const t = q.data;
  const isGateway = t && t.provider !== 'offline';

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t ? formatNaira(t.amount) : 'Transaction'}
        description={t ? `${humanize(t.purpose)} payment · ${t.reference}` : undefined}
        className="max-w-2xl"
      >
        <QueryState isLoading={q.isLoading} error={q.error} rows={4}>
          {t && (
            <div className="space-y-5 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <TransactionStatusBadge status={t.status} />
                <ChannelLabel channel={t.channel} />
                <div className="ml-auto flex gap-2">
                  {t.status === 'pending' &&
                    t.provider === 'simulator' &&
                    t.channel === 'virtual_account' &&
                    can('finance') && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={simulate.isPending}
                        onClick={() =>
                          simulate.mutate(t.id, {
                            onSuccess: () => toast.success('Simulated transfer received'),
                          })
                        }
                      >
                        <Zap />
                        Simulate transfer
                      </Button>
                    )}
                  {isGateway && t.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={requery.isPending}
                      onClick={() =>
                        requery.mutate(t.id, {
                          onSuccess: (r) => toast.info(`Gateway says: ${r.status}`),
                        })
                      }
                    >
                      <RefreshCw />
                      Re-check with gateway
                    </Button>
                  )}
                </div>
              </div>

              <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 sm:grid-cols-2">
                <Item label="Shipment">
                  {t.shipment ? (
                    <Link
                      to={`/shipments/${t.shipment.id}`}
                      className="text-primary font-mono hover:underline"
                    >
                      {t.shipment.trackingNumber}
                    </Link>
                  ) : (
                    '—'
                  )}
                </Item>
                <Item label="Payment method">{PAYMENT_METHOD_LABELS[t.method]}</Item>
                <Item label="Customer">
                  {t.customer.name}
                  <br />
                  <span className="text-muted-foreground">
                    {formatPhone(t.customer.phone)}
                    {t.customer.email && ` · ${t.customer.email}`}
                  </span>
                </Item>
                <Item label="Business client">
                  {t.client ? (
                    <Link to={`/clients/${t.client.id}`} className="text-primary hover:underline">
                      {t.client.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </Item>
                <Item label="Created">{formatDateTime(t.createdAt)}</Item>
                <Item label="Paid">{t.paidAt ? formatDateTime(t.paidAt) : '—'}</Item>
                <Item label="Gateway">
                  {humanize(t.provider)}
                  {t.providerReference && (
                    <span className="text-muted-foreground block font-mono text-xs">
                      {t.providerReference}
                    </span>
                  )}
                </Item>
                <Item label="Gateway response">
                  {t.responseCode ? `${t.responseCode} · ${t.responseDescription ?? ''}` : '—'}
                </Item>
                {t.collectedBy && <Item label="Collected by">{t.collectedBy.name}</Item>}
                {t.recordedBy && <Item label="Recorded by">{t.recordedBy.name}</Item>}
              </dl>

              {t.virtualAccount && (
                <div className="bg-accent-soft rounded-lg border border-amber-300 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Pay-in account
                  </p>
                  <p className="mt-2 font-mono text-xl font-bold tracking-wider">
                    {t.virtualAccount.accountNumber}
                  </p>
                  <p className="text-muted-foreground">
                    {t.virtualAccount.bankName} · {t.virtualAccount.accountName}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Valid until {formatDateTime(t.virtualAccount.expiresAt)}
                  </p>
                </div>
              )}

              <section>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
                  Timeline
                </h3>
                <ol className="space-y-2">
                  {[...t.events].reverse().map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-300" />
                      <div>
                        <p className="font-medium">{humanize(e.type)}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatDateTime(e.at)}
                          {e.note && ` · ${e.note}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
