import { CheckCircle2, Clock, KeyRound, XCircle } from 'lucide-react';
import { StatTile } from '@/shared/components/StatTile';
import { env } from '@/lib/env';
import { ApiKeysCard } from './components/ApiKeysCard';
import { DeliveryLog } from './components/DeliveryLog';
import { WebhookEndpointCard } from './components/WebhookEndpointCard';
import { useClientContext } from './ClientLayout';
import { useWebhookStats } from './clients.queries';

/** Everything an integration needs: keys, the webhook endpoint, and the full delivery history. */
export default function ClientDeveloperPage() {
  const { client, canManage } = useClientContext();
  const stats = useWebhookStats(client.id, !!client.webhook);
  const liveKeys = client.apiKeys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active API keys"
          value={liveKeys.length}
          hint={liveKeys[0]?.lastUsedAt ? 'In use' : 'Not used yet'}
          icon={KeyRound}
        />
        <StatTile
          label="Delivered · 24h"
          value={stats.data?.delivered ?? '—'}
          icon={CheckCircle2}
        />
        <StatTile
          label="Failed · 24h"
          value={stats.data?.failed ?? '—'}
          icon={XCircle}
          highlight={(stats.data?.failed ?? 0) > 0}
        />
        <StatTile label="Retrying now" value={stats.data?.pending ?? '—'} icon={Clock} />
      </div>

      <div className="bg-card rounded-lg border p-4 text-sm">
        <p className="font-medium">Quick start</p>
        <p className="text-muted-foreground mt-1">
          Share the integration guide (<code className="font-mono">docs/integrations.md</code>) and
          one API key with the client’s developer.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-blue-950 p-3 font-mono text-xs text-blue-100">{`curl ${env.VITE_API_BASE_URL}/v1/zones \\\n  -H "Authorization: Bearer ${liveKeys[0]?.preview ?? 'est_live_…'}"`}</pre>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <ApiKeysCard clientId={client.id} keys={client.apiKeys} canManage={canManage} />
        </div>
        <div className="xl:col-span-3">
          <WebhookEndpointCard
            key={client.webhook?.url ?? 'none'}
            client={client}
            canManage={canManage}
          />
        </div>
      </div>

      {client.webhook && <DeliveryLog clientId={client.id} canManage={canManage} />}
    </div>
  );
}
