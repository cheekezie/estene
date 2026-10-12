import type { AdminRole } from '@estene/contracts/enums';
import { useAuthStore } from '@/stores/auth.store';

/** Mirrors the API's requireRole: super_admin passes everything. UI hint only — the API enforces. */
export function useCan() {
  const role = useAuthStore((s) => s.user?.role);
  return (...roles: AdminRole[]) => !!role && (role === 'super_admin' || roles.includes(role));
}
