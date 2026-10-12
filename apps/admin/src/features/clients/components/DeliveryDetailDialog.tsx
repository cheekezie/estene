import { useState, type ReactNode } from 'react';
import { Check, Copy, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@estene/lib/date';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { QueryState } from '@/shared/components/QueryState';
import { useResendDelivery, useWebhookDelivery } from '../clients.queries';
import { DELIVERY_TONE, deliveryResultLabel } from './DeliveryLog';

/** One delivery, exactly as sent: headers, signed body, and what the endpoint answered. */
export function DeliveryDetailDialog({
  clientId,
  deliveryId,
  canManage,
  onClose,
}: {
  clientId: string;
  deliveryId: string | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const q = useWebhookDelivery(clientId, deliveryId);
  const resend = useResendDelivery(clientId);
  const d = q.data;

  return (
    <Dialog open={!!deliveryId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={d?.title ?? 'Delivery'} description={d?.summary} className="max-w-3xl">
        <QueryState isLoading={q.isLoading} error={q.error} rows={4}>
          {d && (
            <div className="space-y-5 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={DELIVERY_TONE[d.status]}>{deliveryResultLabel(d)}</Badge>
                <span className="text-muted-foreground">
                  {d.attempts} {d.attempts === 1 ? 'attempt' : 'attempts'}
                </span>
                {d.lastDurationMs != null && (
                  <span className="text-muted-foreground">· {d.lastDurationMs} ms</span>
                )}
                {canManage && d.status !== 'pending' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    loading={resend.isPending}
                    onClick={() =>
                      resend.mutate(d.id, {
                        onSuccess: () => toast.success('Re-queued to the current endpoint URL'),
                      })
                    }
                  >
                    <RotateCw />
                    Resend
                  </Button>
                )}
              </div>

              <dl className="grid gap-x-6 gap-y-2 rounded-lg border p-4 sm:grid-cols-2">
                <Item label="Event">
                  <code className="font-mono">{d.type}</code>
                </Item>
                <Item label="Event id">
                  <code className="font-mono">{d.eventId}</code>
                </Item>
                <Item label="Queued">{formatDateTime(d.createdAt)}</Item>
                <Item label="Last attempt">
                  {d.lastAttemptAt ? formatDateTime(d.lastAttemptAt) : '—'}
                </Item>
                <Item label="Endpoint" wide>
                  <code className="break-all font-mono">POST {d.url}</code>
                </Item>
                {d.lastError && (
                  <Item label="Last error" wide>
                    <span className="text-destructive">{d.lastError}</span>
                  </Item>
                )}
              </dl>

              <Block title="Headers sent">
                <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs leading-relaxed">
                  {[
                    'Content-Type: application/json',
                    'User-Agent: Estene-Webhooks/1.0',
                    `Estene-Event: ${d.type}`,
                    `Estene-Delivery: ${d.eventId}`,
                    'Estene-Signature: t=<unix time>,v1=<HMAC-SHA256 of "t.body">',
                  ].join('\n')}
                </pre>
              </Block>

              <Block title="Payload" copy={JSON.stringify(d.payload, null, 2)}>
                <pre className="max-h-80 overflow-auto rounded-lg bg-blue-950 p-3 font-mono text-xs leading-relaxed text-blue-100">
                  {JSON.stringify(d.payload, null, 2)}
                </pre>
              </Block>

              <Block title={`Response${d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ''}`}>
                <pre className="bg-muted max-h-40 overflow-auto rounded-lg p-3 font-mono text-xs">
                  {d.lastResponseBody ||
                    (d.lastStatusCode ? '(empty body)' : 'No response received')}
                </pre>
              </Block>
            </div>
          )}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}

function Item({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Block({ title, copy, children }: { title: string; copy?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          {title}
        </h3>
        {copy && (
          <button
            type="button"
            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
            onClick={() => navigator.clipboard.writeText(copy).then(() => setCopied(true))}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
