import { useState } from 'react';
import { Eye, RotateCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { ClientDto } from '@estene/contracts/client';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@estene/contracts/enums';
import { WEBHOOK_EVENT_META, type WebhookEventGroup } from '@estene/contracts/webhook-events';
import { cn } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import {
  revealSecret,
  useRemoveWebhook,
  useRotateSecret,
  useSaveWebhook,
  useSendTestEvent,
} from '../clients.queries';
import { SecretReveal } from './SecretReveal';

const GROUPS: WebhookEventGroup[] = ['Booking', 'Rider', 'On the move', 'Outcome', 'Billing'];
const eventsIn = (g: WebhookEventGroup) =>
  WEBHOOK_EVENTS.filter((e) => WEBHOOK_EVENT_META[e].group === g);

export function WebhookEndpointCard({
  client,
  canManage,
}: {
  client: ClientDto;
  canManage: boolean;
}) {
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
    !hook ||
    hook.url !== url ||
    hook.isActive !== isActive ||
    [...hook.events].sort().join() !== [...events].sort().join();
  // Keep subscriptions in catalogue order so diffs and payload comparisons stay stable.
  const setSelected = (next: Set<WebhookEvent>) =>
    setEvents(WEBHOOK_EVENTS.filter((e) => next.has(e)));
  const toggle = (e: WebhookEvent) => {
    const next = new Set(events);
    if (next.has(e)) next.delete(e);
    else next.add(e);
    setSelected(next);
  };
  const toggleGroup = (g: WebhookEventGroup, on: boolean) => {
    const next = new Set(events);
    eventsIn(g).forEach((e) => (on ? next.add(e) : next.delete(e)));
    setSelected(next);
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Webhook endpoint</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            We POST signed JSON to this URL as the client’s shipments move.
          </p>
        </div>
        {hook ? (
          <Badge tone={hook.isActive ? 'success' : 'neutral'} dot>
            {hook.isActive ? 'Sending' : 'Paused'}
          </Badge>
        ) : (
          <Badge>Not set up</Badge>
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
          <div className="flex items-baseline justify-between">
            <legend className="text-sm font-medium">
              Events{' '}
              <span className="text-muted-foreground font-normal">
                · {events.length} of {WEBHOOK_EVENTS.length}
              </span>
            </legend>
            {canManage && (
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setSelected(new Set(WEBHOOK_EVENTS))}
                >
                  All
                </button>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setSelected(new Set())}
                >
                  None
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {GROUPS.map((g) => {
              const groupEvents = eventsIn(g);
              const allOn = groupEvents.every((e) => events.includes(e));
              return (
                <div key={g} className="rounded-lg border">
                  <label className="bg-muted/50 text-muted-foreground flex items-center justify-between border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                    {g}
                    <input
                      type="checkbox"
                      className="accent-primary size-3.5"
                      checked={allOn}
                      onChange={(e) => toggleGroup(g, e.target.checked)}
                      disabled={!canManage}
                      aria-label={`All ${g} events`}
                    />
                  </label>
                  <ul className="divide-y">
                    {groupEvents.map((e) => (
                      <li key={e}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 px-3 py-2.5',
                            events.includes(e) && 'bg-primary-soft/40',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="accent-primary mt-0.5 size-4"
                            checked={events.includes(e)}
                            onChange={() => toggle(e)}
                            disabled={!canManage}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">
                              {WEBHOOK_EVENT_META[e].title}
                            </span>
                            <span className="text-muted-foreground block text-xs">
                              {WEBHOOK_EVENT_META[e].description}
                            </span>
                            <code className="text-muted-foreground/80 mt-0.5 block font-mono text-[11px]">
                              {e}
                            </code>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
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
          Send events to this endpoint
        </label>

        {secret && (
          <SecretReveal
            value={secret}
            label="Signing secret — the client verifies the Estene-Signature header with it."
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
              Save endpoint
            </Button>
            {hook && (
              <>
                <Button
                  variant="outline"
                  loading={test.isPending}
                  onClick={() =>
                    test.mutate(undefined, {
                      onSuccess: () => toast.success('Test event queued — see the delivery log'),
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
                  Remove endpoint
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
