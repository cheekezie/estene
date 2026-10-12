import { useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { ApiKeyDto } from '@estene/contracts/client';
import { formatRelativeDay } from '@estene/lib/date';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardHeader, CardTitle } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { useCreateApiKey, useRevokeApiKey } from '../clients.queries';
import { SecretReveal } from './SecretReveal';

export function ApiKeysCard({
  clientId,
  keys,
  canManage,
}: {
  clientId: string;
  keys: ApiKeyDto[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKeyDto | null>(null);
  const revoke = useRevokeApiKey(clientId);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>API keys</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            Used as <code className="font-mono">Authorization: Bearer est_live_…</code> on the
            integration API.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus />
            New key
          </Button>
        )}
      </CardHeader>
      {keys.length === 0 ? (
        <p className="text-muted-foreground px-5 py-8 text-center text-sm">
          No API keys. This client books by phone only.
        </p>
      ) : (
        <ul className="divide-y">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <KeyRound className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {k.name}{' '}
                    <code className="text-muted-foreground ml-1 font-mono text-xs font-normal">
                      {k.preview}
                    </code>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Created {formatRelativeDay(k.createdAt)} ·{' '}
                    {k.lastUsedAt ? `last used ${formatRelativeDay(k.lastUsedAt)}` : 'never used'}
                  </p>
                </div>
              </div>
              {k.revokedAt ? (
                <Badge tone="neutral">Revoked</Badge>
              ) : canManage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setConfirmRevoke(k)}
                >
                  Revoke
                </Button>
              ) : (
                <Badge tone="success">Active</Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating && <CreateKeyDialog clientId={clientId} onClose={() => setCreating(false)} />}

      <Dialog open={!!confirmRevoke} onOpenChange={(o) => !o && setConfirmRevoke(null)}>
        <DialogContent
          title={`Revoke “${confirmRevoke?.name}”?`}
          description="Requests using this key are rejected immediately. This cannot be undone."
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>
              Keep key
            </Button>
            <Button
              variant="destructive"
              loading={revoke.isPending}
              onClick={() =>
                confirmRevoke &&
                revoke.mutate(confirmRevoke.id, {
                  onSuccess: () => {
                    toast.success('API key revoked');
                    setConfirmRevoke(null);
                  },
                })
              }
            >
              Revoke key
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CreateKeyDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [name, setName] = useState('Production');
  const create = useCreateApiKey(clientId);
  const key = create.data?.key;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={key ? 'API key created' : 'New API key'}>
        {key ? (
          <div className="space-y-4">
            <SecretReveal value={key} label="Copy this key now — it will never be shown again." />
            <p className="text-muted-foreground text-sm">
              Share it with the client over a secure channel (not email in plain text). If it’s
              lost, revoke it and create a new one.
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(name.trim());
            }}
          >
            <Field
              label="Key name"
              hint="Helps tell keys apart, e.g. Production, Staging, Warehouse app."
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={name.trim().length < 2} loading={create.isPending}>
                Create key
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
