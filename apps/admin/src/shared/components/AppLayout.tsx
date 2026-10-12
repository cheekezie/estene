import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { LogOut, Menu, X } from 'lucide-react';
import { Logo } from '@estene/ui/Logo';
import { cn, humanize, initials } from '@estene/lib/utils';
import { NAV_SECTIONS } from '@/config/navigation';
import { api } from '@/lib/api';
import { useCan } from '@/shared/hooks/useCan';
import { useAuthStore } from '@/stores/auth.store';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-64">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <button className="rounded-md p-1 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <Nav onNavigate={() => setOpen(false)} />
        <UserMenu />
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={() => setOpen(false)} />}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur lg:hidden">
        <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <Logo />
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

function Nav({ onNavigate }: { onNavigate: () => void }) {
  const can = useCan();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
      {NAV_SECTIONS.map((section, i) => {
        const items = section.items.filter((item) => !item.roles || can(...item.roles));
        if (!items.length) return null;
        return (
          <div key={i}>
            {section.title && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {items.map(({ label, to, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  if (!user) return null;

  const signOut = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex items-center gap-3 border-t p-4">
      <div className="grid size-9 place-items-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
        {initials(user.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{humanize(user.role)}</p>
      </div>
      <button onClick={signOut} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sign out" title="Sign out">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
