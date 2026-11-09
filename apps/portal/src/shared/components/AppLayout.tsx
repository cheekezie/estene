import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageOpen,
  PackagePlus,
  Receipt,
  Tag,
  Wallet,
  X,
} from 'lucide-react';
import { Logo } from '@estene/ui/Logo';
import { cn, initials } from '@estene/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

type NavItem = { label: string; to: string; icon: LucideIcon };

const MAIN: NavItem[] = [
  { label: 'Overview', to: '/', icon: LayoutDashboard },
  { label: 'Deliveries', to: '/deliveries', icon: Package },
  { label: 'Statement', to: '/statement', icon: Receipt },
];
const WAREHOUSE: NavItem[] = [
  { label: 'Orders', to: '/orders', icon: PackageOpen },
  { label: 'Stock', to: '/stock', icon: Boxes },
  { label: 'Inbound', to: '/inbound', icon: PackagePlus },
  { label: 'Products', to: '/products', icon: Tag },
  { label: 'Handling fees', to: '/billing', icon: Wallet },
];

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const sections: { title?: string; items: NavItem[] }[] = [
    { items: MAIN },
    ...(user?.client.warehousing ? [{ title: 'Warehouse', items: WAREHOUSE }] : []),
    { title: 'Account', items: [{ label: 'Password', to: '/account', icon: KeyRound }] },
  ];

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside
        className={cn(
          'bg-card fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <button
            className="rounded-md p-1 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>
        {user && (
          <p className="text-muted-foreground px-6 pb-3 text-xs font-medium">{user.client.name}</p>
        )}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          {sections.map((section, i) => (
            <div key={i}>
              {section.title && (
                <p className="text-muted-foreground mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider">
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map(({ label, to, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary-soft text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                    >
                      <Icon className="size-4" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <UserMenu />
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <header className="bg-card/90 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur lg:hidden">
        <button
          className="hover:bg-muted rounded-md p-1.5"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <Logo />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  if (!user) return null;

  const signOut = async () => {
    await api.post('/auth/client/logout').catch(() => undefined);
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex items-center gap-3 border-t p-4">
      <div className="bg-primary-soft text-primary grid size-9 place-items-center rounded-full text-xs font-semibold">
        {initials(user.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-muted-foreground truncate text-xs">{user.email}</p>
      </div>
      <button
        onClick={signOut}
        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
