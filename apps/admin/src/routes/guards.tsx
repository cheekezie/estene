import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/stores/auth.store';

export function RequireAuth() {
  const token = useAuthStore((s) => s.accessToken);
  const location = useLocation();
  return token ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export function RequireGuest() {
  const token = useAuthStore((s) => s.accessToken);
  return token ? <Navigate to="/" replace /> : <Outlet />;
}
