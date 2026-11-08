import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/stores/auth.store';

export function RequireAuth() {
  const token = useAuthStore((s) => s.accessToken);
  const mustChange = useAuthStore((s) => s.user?.mustChangePassword);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // The temporary password from Estene must be replaced before anything else.
  if (mustChange) return <Navigate to="/set-password" replace />;
  return <Outlet />;
}

export function RequireGuest() {
  const token = useAuthStore((s) => s.accessToken);
  return token ? <Navigate to="/" replace /> : <Outlet />;
}

/** Warehouse pages only exist for businesses that store stock with us. */
export function RequireWarehousing() {
  const on = useAuthStore((s) => s.user?.client.warehousing);
  return on ? <Outlet /> : <Navigate to="/" replace />;
}
