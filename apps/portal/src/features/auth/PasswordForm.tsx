import { useState } from 'react';
import { toast } from 'sonner';
import { PortalChangePasswordSchema } from '@estene/contracts/portal';
import { Button } from '@estene/ui/button';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { fieldErrors } from '@/shared/forms';
import { useChangePassword } from './auth.queries';

export function PasswordForm({
  currentLabel = 'Current password',
  onDone,
}: {
  currentLabel?: string;
  onDone?: () => void;
}) {
  const change = useChangePassword();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = PortalChangePasswordSchema.safeParse({ currentPassword, newPassword });
        const errs = parsed.success ? {} : fieldErrors(parsed.error);
        if (newPassword !== confirm) errs.confirm = 'The passwords don’t match';
        setErrors(errs);
        if (!parsed.success || errs.confirm) return;
        change.mutate(parsed.data, {
          onSuccess: () => {
            toast.success('Password changed');
            setCurrent('');
            setNew('');
            setConfirm('');
            onDone?.();
          },
        });
      }}
    >
      <Field label={currentLabel} error={errors.currentPassword}>
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field
        label="New password"
        error={errors.newPassword}
        hint="At least 10 characters, with a letter and a number."
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
        />
      </Field>
      <Field label="Repeat new password" error={errors.confirm}>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" loading={change.isPending}>
        Save password
      </Button>
    </form>
  );
}
