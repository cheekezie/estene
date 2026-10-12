import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { AdminLoginSchema, type AdminLoginInput, type AdminProfile } from '@estene/contracts/auth';
import { Button } from '@estene/ui/button';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Logo } from '@estene/ui/Logo';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

export default function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';

  const { register, handleSubmit, formState } = useForm<AdminLoginInput>({ resolver: zodResolver(AdminLoginSchema) });
  const login = useMutation({
    mutationFn: (body: AdminLoginInput) => api.post<{ accessToken: string; user: AdminProfile }>('/auth/admin/login', body),
    onSuccess: (session) => {
      setSession(session);
      navigate(from, { replace: true });
    },
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-blue-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo inverted />
        <div className="relative z-10 max-w-md">
          <p className="font-display text-4xl leading-tight font-bold">
            Every parcel in Abuja, <span className="text-amber-400">moving.</span>
          </p>
          <p className="mt-4 text-blue-200">Dispatch, riders, pricing and money — one console for Estene operations.</p>
        </div>
        <p className="text-sm text-blue-300">© {new Date().getFullYear()} Estene Logistics</p>
        <RouteArt />
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit((v) => login.mutate(v))} className="w-full max-w-sm space-y-5" noValidate>
          <div className="lg:hidden"><Logo /></div>
          <div>
            <h1 className="font-display text-2xl font-bold">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use your Estene staff account.</p>
          </div>
          <Field label="Email" error={formState.errors.email?.message}>
            <Input type="email" autoComplete="email" autoFocus {...register('email')} />
          </Field>
          <Field label="Password" error={formState.errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={login.isPending}>Sign in</Button>
        </form>
      </div>
    </div>
  );
}

/** Decorative route lines — the brand's "network" motif. */
function RouteArt() {
  return (
    <svg className="absolute -right-24 bottom-0 h-[70%] opacity-60" viewBox="0 0 400 400" fill="none" aria-hidden>
      <path d="M20 380 C 120 300, 80 200, 200 180 S 340 80, 390 20" stroke="var(--color-blue-700)" strokeWidth="2" strokeDasharray="6 8" />
      <path d="M60 390 C 160 320, 180 260, 260 240 S 360 160, 400 120" stroke="var(--color-blue-800)" strokeWidth="2" />
      <path d="M0 300 C 100 260, 140 140, 240 120" stroke="var(--color-amber-400)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="240" cy="120" r="7" fill="var(--color-amber-400)" />
      <circle cx="200" cy="180" r="5" fill="var(--color-blue-400)" />
      <circle cx="260" cy="240" r="5" fill="var(--color-blue-400)" />
    </svg>
  );
}
