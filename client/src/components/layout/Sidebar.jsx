import { NavLink } from 'react-router-dom';
import { HeartPulse, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { navItemsFor } from '@/utils/constants';

// Icons only, so each item carries a tooltip with the page name and a screen reader label. Below lg this
// rail is replaced by the drawer in the top bar.
export default function Sidebar() {
  const { user, logout } = useAuth();
  const items = navItemsFor(user.role);

  return (
    <aside className="fixed bottom-5 left-5 top-5 z-30 hidden w-[68px] flex-col items-center rounded-panel bg-card py-5 shadow-rail lg:flex">
      <span className="flex h-11 w-11 items-center justify-center rounded-control bg-primary text-white">
        <HeartPulse size={22} aria-hidden="true" />
      </span>

      <nav className="mt-8 flex flex-1 flex-col items-center gap-3" aria-label="Main">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group relative flex h-11 w-11 items-center justify-center rounded-pill transition ${
                isActive ? 'bg-primary text-white' : 'text-ink-muted hover:bg-page hover:text-ink'
              }`
            }
          >
            <Icon size={20} aria-hidden="true" />
            <span className="sr-only">{label}</span>
            <span className="pointer-events-none absolute left-full z-40 ml-3 hidden whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs text-white group-hover:block">
              {label}
            </span>
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={logout}
        className="group relative flex h-11 w-11 items-center justify-center rounded-pill text-ink-muted transition hover:bg-page hover:text-danger"
      >
        <LogOut size={20} aria-hidden="true" />
        <span className="sr-only">Sign out</span>
        <span className="pointer-events-none absolute left-full z-40 ml-3 hidden whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs text-white group-hover:block">
          Sign out
        </span>
      </button>
    </aside>
  );
}
