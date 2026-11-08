import { Navigate, useNavigate } from 'react-router';
import { Logo } from '@estene/ui/Logo';
import { useAuthStore } from '@/stores/auth.store';
import { PasswordForm } from './PasswordForm';

/** First sign-in: replace the temporary password Estene gave you. */
export default function SetPasswordPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/" replace />;

  return (
    <div className="bg-muted/40 grid min-h-dvh place-items-center p-6">
      <div className="bg-card w-full max-w-sm space-y-5 rounded-xl border p-8 shadow-sm">
        <Logo />
        <div>
          <h1 className="font-display text-2xl font-bold">Choose your password</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Welcome, {user.name}. Replace the temporary password from Estene to continue.
          </p>
        </div>
        <PasswordForm
          currentLabel="Temporary password"
          onDone={() => navigate('/', { replace: true })}
        />
      </div>
    </div>
  );
}
