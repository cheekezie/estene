import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ADMIN_ROLES, type AdminRole } from '@estene/contracts/enums';
import type { AdminProfile } from '@estene/contracts/auth';
import { formatRelativeDay } from '@estene/lib/date';
import { humanize } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { api } from '@/lib/api';
import { PageHeader } from '@/shared/components/PageHeader';
import { QueryState } from '@/shared/components/QueryState';

type Staff = AdminProfile & { isActive: boolean; lastLoginAt?: string };

const ROLE_HINT: Record<AdminRole, string> = {
  super_admin: 'Everything, including staff accounts',
  ops_manager: 'Riders, zones, dispatch and pricing',
  dispatcher: 'Assign riders and manage shipments',
  finance: 'Payments, payouts and pricing',
  support: 'View everything, book shipments for callers',
};

export default function StaffPage() {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['staff'], queryFn: () => api.get<Staff[]>('/staff') });
  return (
    <>
      <PageHeader
        title="Staff"
        description="Back-office accounts and what each role can do."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            Add staff
          </Button>
        }
      />
      <Card>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Last sign-in</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {q.data?.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-muted-foreground text-xs">{s.email}</p>
                  </TD>
                  <TD>
                    <p>{humanize(s.role)}</p>
                    <p className="text-muted-foreground text-xs">{ROLE_HINT[s.role]}</p>
                  </TD>
                  <TD className="text-muted-foreground">
                    {s.lastLoginAt ? formatRelativeDay(s.lastLoginAt) : 'Never'}
                  </TD>
                  <TD>
                    <Badge tone={s.isActive ? 'success' : 'neutral'}>
                      {s.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </QueryState>
      </Card>
      {open && <AddStaffDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function AddStaffDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm<{ name: string; email: string; role: AdminRole }>({
    defaultValues: { role: 'dispatcher' },
  });
  const create = useMutation({
    mutationFn: (body: { name: string; email: string; role: AdminRole }) =>
      api.post<{ tempPassword: string }>('/staff', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff'] }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={create.data ? 'Account created' : 'Add staff member'}>
        {create.data ? (
          <div className="space-y-4 text-sm">
            <p>Share this temporary password securely. It is shown once.</p>
            <code className="bg-muted block rounded-md px-3 py-2 font-mono text-base font-semibold">
              {create.data.tempPassword}
            </code>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4">
            <Field label="Full name">
              <Input required {...register('name')} />
            </Field>
            <Field label="Work email">
              <Input type="email" required {...register('email')} />
            </Field>
            <Field label="Role">
              <Select
                options={ADMIN_ROLES.map((r) => ({
                  value: r,
                  label: `${humanize(r)} — ${ROLE_HINT[r]}`,
                }))}
                {...register('role')}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create account
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
