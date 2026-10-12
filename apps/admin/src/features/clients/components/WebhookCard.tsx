import { useState } from 'react';
import { Eye, RefreshCw, RotateCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { ClientDto } from '@estene/contracts/client';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@estene/contracts/enums';
import { formatRelativeDay } from '@estene/lib/date';
import { cn } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import {
  revealSecret,
  useRemoveWebhook,
  useResendDelivery,
  useRotateSecret,
  useSaveWebhook,
  useSendTestEvent,
  useWebhookDeliveries,
} from '../clients.queries';
import { SecretReveal } from './SecretReveal';

const EVENT_HINT: Record<WebhookEvent, string> = {
  'order.created': 'A new order was booked for this client',
  'order.status_changed': 'Every milestone: assigned, picked up, out for delivery, delivered…',
  'order.price_adjusted': 'The rider changed the price at pickup',
};

export function WebhookCard({ client, canManage }: { client: ClientDto; canManage: boolean }) {
  const hook = client.webhook;
  const [url, setUrl] = useState(hook?.url ?? '');
  const [events, setEvents] = useState<WebhookEvent[]>(hook?.events ?? [...WEBHOOK_EVENTS]);
  const [isActive, setIsActive] = useState(hook?.isActive ?? true);
  const [secret, setSecret] = useState<string | null>(null);

  const save = useSaveWebhook(client.id);
  const remove = useRemoveWebhook(client.id);
  const rotate = useRotateSecret(client.id);
  const test = useSendTestEvent(client.id);

  const dirty =
    !hook || hook.url !== url || hook.isActive !== isActive || hook.events.join() !== events.join();
  const toggle = (e: WebhookEvent) =>
    setEvents((cur) =>
      cur.includes(e)
        ? cur.filter((x) => x !== e)
        : WEBHOOK_EVENTS.filter((x) => x === e || cur.includes(x)),
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Webhook</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              We POST signed JSON to this URL when the client’s orders change.
            </p>
          </div>
          {hook && (
            <Badge tone={hook.isActive ? 'success' : 'neutral'} dot>
              {hook.isActive ? 'Sending' : 'Paused'}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Endpoint URL" hint="Must be https in production.">
            <Input
              type="url"
              placeholder="https://example.com/webhooks/estene"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!canManage}
            />
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">Events</legend>
            <div className="mt-2 space-y-2">
              {WEBHOOK_EVENTS.map((e) => (
                <label
                  key={e}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-md border p-3',
                    events.includes(e) && 'border-primary/40 bg-primary-soft/50',
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-primary mt-0.5 size-4"
                    checked={events.includes(e)}
                    onChange={() => toggle(e)}
                    disabled={!canManage}
                  />
                  <span>
                    <code className="font-mono text-sm font-medium">{e}</code>
                    <span className="text-muted-foreground block text-xs">{EVENT_HINT[e]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={!canManage}
            />
            Send events
          </label>

          {secret && (
            <SecretReveal
              value={secret}
              label="Signing secret — the client uses this to verify the Estene-Signature header."
            />
          )}

          {canManage && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button
                disabled={!dirty || !url || events.length === 0}
                loading={save.isPending}
                onClick={() =>
                  save.mutate(
                    { url, events, isActive },
                    {
                      onSuccess: (res) => {
                        toast.success('Webhook saved');
                        if (res.secret) setSecret(res.secret);
                      },
                    },
                  )
                }
              >
                Save webhook
              </Button>
              {hook && (
                <>
                  <Button
                    variant="outline"
                    loading={test.isPending}
                    onClick={() =>
                      test.mutate(undefined, {
                        onSuccess: () => toast.success('Test event queued — check the log below'),
                      })
                    }
                  >
                    <Send />
                    Send test event
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => revealSecret(client.id).then((r) => setSecret(r.secret))}
                  >
                    <Eye />
                    Reveal secret
                  </Button>
                  <Button
                    variant="ghost"
                    loading={rotate.isPending}
                    onClick={() =>
                      rotate.mutate(undefined, {
                        onSuccess: (r) => {
                          setSecret(r.secret);
                          toast.success('Secret rotated — the client must update their verifier');
                        },
                      })
                    }
                  >
                    <RotateCw />
                    Rotate secret
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive ml-auto"
                    loading={remove.isPending}
                    onClick={() =>
                      remove.mutate(undefined, {
                        onSuccess: () => {
                          toast.success('Webhook removed');
                          setUrl('');
                          setSecret(null);
                        },
                      })
                    }
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {hook && <DeliveryLog clientId={client.id} canManage={canManage} />}
    </div>
  );
}

const DELIVERY_TONE = { pending: 'progress', delivered: 'success', failed: 'error' } as const;

function DeliveryLog({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const q = useWebhookDeliveries(clientId, true);
  const resend = useResendDelivery(clientId);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Delivery log</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            Last 50 events. Failed sends retry automatically for about an hour.
          </p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Refresh" onClick={() => q.refetch()}>
          <RefreshCw className={cn(q.isFetching && 'animate-spin')} />
        </Button>
      </CardHeader>
      {q.data?.length === 0 ? (
        <p className="text-muted-foreground px-5 py-8 text-center text-sm">
          No events sent yet. Send a test event to check the endpoint.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Event</TH>
              <TH>Order</TH>
              <TH>Result</TH>
              <TH>When</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {q.data?.map((d) => (
              <TR key={d.id}>
                <TD>
                  <code className="font-mono text-xs">{d.type}</code>
                </TD>
                <TD className="font-mono text-xs">{d.trackingNumber ?? '—'}</TD>
                <TD>
                  <Badge tone={DELIVERY_TONE[d.status]}>
                    {d.status === 'delivered'
                      ? `Delivered${d.lastStatusCode ? ` · ${d.lastStatusCode}` : ''}`
                      : d.status === 'failed'
                        ? 'Failed'
                        : 'Retrying'}
                  </Badge>
                  {d.lastError && d.status !== 'delivered' && (
                    <p
                      className="text-muted-foreground mt-1 max-w-60 truncate text-xs"
                      title={d.lastError}
                    >
                      {d.lastError} · {d.attempts} {d.attempts === 1 ? 'attempt' : 'attempts'}
                    </p>
                  )}
                </TD>
                <TD className="text-muted-foreground whitespace-nowrap">
                  {formatRelativeDay(d.createdAt)}
                </TD>
                <TD className="text-right">
                  {canManage && d.status !== 'pending' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        resend.mutate(d.id, { onSuccess: () => toast.success('Re-queued') })
                      }
                    >
                      Resend
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
