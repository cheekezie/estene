import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ClientLoginSchema } from '@estene/contracts/portal';
import { Button } from '@estene/ui/button';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Logo } from '@estene/ui/Logo';
import { fieldErrors } from '@/shared/forms';
import { useLogin } from './auth.queries';

export default function LoginPage() {
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <div className="bg-muted/40 grid min-h-dvh place-items-center p-6">
      <form
        noValidate
        className="bg-card w-full max-w-sm space-y-5 rounded-xl border p-8 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = ClientLoginSchema.safeParse({ email, password });
          if (!parsed.success) return setErrors(fieldErrors(parsed.error));
          setErrors({});
          login.mutate(parsed.data, {
            onSuccess: (s) =>
              navigate(s.user.mustChangePassword ? '/set-password' : from, { replace: true }),
          });
        }}
      >
        <Logo />
        <div>
          <h1 className="font-display text-2xl font-bold">Business sign in</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your deliveries, stock and orders with Estene.
          </p>
        </div>
        <Field label="Email" error={errors.email}>
          <Input
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" error={errors.password}>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
          Sign in
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          No account yet? Ask your Estene account manager to set one up.
        </p>
      </form>
    </div>
  );
}
