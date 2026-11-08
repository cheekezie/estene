import { useState } from 'react';
import { KeyRound, Plus, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { PortalUserCreateSchema, type PortalUserCredentialsDto } from '@estene/contracts/portal';
import { formatRelativeDay } from '@estene/lib/date';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { QueryState } from '@/shared/components/QueryState';
import {
  useCreatePortalUser,
  usePortalUsers,
  useResetPortalPassword,
  useSetPortalUserActive,
} from '../clients.queries';
import { SecretReveal } from './SecretReveal';

/** People at the business who sign in to the client portal (stock, orders, deliveries, statement). */
export function PortalUsersCard({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const q = usePortalUsers(clientId);
  const reset = useResetPortalPassword(clientId);
  const setActive = useSetPortalUserActive(clientId);
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<PortalUserCredentialsDto | null>(null);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Portal access</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            Staff at this business sign in to the client portal with these accounts.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            Add user
          </Button>
        )}
      </CardHeader>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch} rows={2}>
        {q.data && q.data.length === 0 ? (
          <CardContent className="text-muted-foreground text-sm">No portal users yet.</CardContent>
        ) : (
          <ul className="divide-y">
            {q.data?.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <UserRound className="text-muted-foreground size-4" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {u.name}
                    {!u.isActive && <Badge className="ml-2">Off</Badge>}
                    {u.isActive && u.mustChangePassword && (
                      <Badge tone="info" className="ml-2">
                        Not signed in yet
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {u.email}
                    {u.lastLoginAt && ` · last sign-in ${formatRelativeDay(u.lastLoginAt)}`}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={reset.isPending && reset.variables === u.id}
                      onClick={() =>
                        reset.mutate(u.id, {
                          onSuccess: (r) => setIssued(r),
                        })
                      }
                    >
                      <KeyRound />
                      Reset password
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={u.isActive ? 'text-destructive' : undefined}
                      loading={setActive.isPending && setActive.variables?.userId === u.id}
                      onClick={() =>
                        setActive.mutate(
                          { userId: u.id, isActive: !u.isActive },
                          {
                            onSuccess: () =>
                              toast.success(u.isActive ? 'Access switched off' : 'Access restored'),
                          },
                        )
                      }
                    >
                      {u.isActive ? 'Switch off' : 'Restore'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      {adding && (
        <AddUserDialog
          clientId={clientId}
          onClose={() => setAdding(false)}
          onCreated={(r) => {
            setAdding(false);
            setIssued(r);
          }}
        />
      )}
      <Dialog open={!!issued} onOpenChange={(v) => !v && setIssued(null)}>
        {issued && (
          <DialogContent
            title={`Sign-in details for ${issued.user.name}`}
            description="Share these with them now — the password is not shown again. They choose their own password at first sign-in."
          >
            <div className="space-y-3">
              <p className="text-sm">
                Email: <span className="font-medium">{issued.user.email}</span>
              </p>
              <SecretReveal label="Temporary password" value={issued.temporaryPassword} />
              <div className="flex justify-end pt-2">
                <Button onClick={() => setIssued(null)}>Done</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

function AddUserDialog({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string;
  onClose: () => void;
  onCreated: (r: PortalUserCredentialsDto) => void;
}) {
  const create = useCreatePortalUser(clientId);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Add portal user">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = PortalUserCreateSchema.safeParse({ name, email });
            if (!parsed.success) {
              const map: Record<string, string> = {};
              for (const i of parsed.error.issues) map[i.path.join('.')] ??= i.message;
              return setErrors(map);
            }
            create.mutate(parsed.data, { onSuccess: onCreated });
          }}
        >
          <Field label="Name" error={errors.name}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create and show password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
