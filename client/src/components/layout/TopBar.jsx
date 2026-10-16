import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, HeartPulse, LogOut, Menu, X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS, navItemsFor } from '@/utils/constants';

// The rail is icon only and disappears below lg, so this bar carries what the rail cannot: the brand on
// a phone, and the signed in account on every screen. It has no horizontal padding of its own: it sits in
// the same column as the page below it, so the two share their edges.
export default function TopBar() {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const accountRef = useRef(null);

  // a click anywhere outside the account menu closes it, the same way a native menu behaves
  useEffect(() => {
    if (!isAccountOpen) {
      return undefined;
    }

    function onPointerDown(event) {
      if (!accountRef.current?.contains(event.target)) {
        setIsAccountOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);

    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isAccountOpen]);

  if (!user) {
    return null;
  }

  return (
    <header className="flex items-center justify-between gap-3 pb-2 pt-6 lg:pt-8">
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setIsMenuOpen(true)}
          aria-label="Open navigation"
          className="rounded-control bg-card p-2.5 text-ink shadow-card transition hover:text-primary"
        >
          <Menu size={20} />
        </button>
        <span className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-primary text-white">
            <HeartPulse size={18} aria-hidden="true" />
          </span>
          <span className="text-sm font-bold tracking-wide text-ink">EMR</span>
        </span>
      </div>

      {/* the brand is gone above lg, so the account cluster takes the free space and stays on the right */}
      <div className="flex items-center gap-2 lg:ml-auto">
        <div className="relative" ref={accountRef}>
          <button
            type="button"
            onClick={() => setIsAccountOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={isAccountOpen}
            className="flex items-center gap-2 rounded-pill bg-card px-2 py-1.5 shadow-card transition hover:text-primary"
          >
            <Avatar name={user.name} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-semibold leading-tight text-ink">{user.name}</span>
              {/* the role is stated once, here, rather than also as a pill beside this cluster */}
              <span className="block text-xs leading-tight text-ink-muted">{ROLE_LABELS[user.role]}</span>
            </span>
            <ChevronDown size={14} className="text-ink-muted" aria-hidden="true" />
          </button>

          {isAccountOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-40 mt-2 w-56 rounded-card bg-card p-2 shadow-pop"
            >
              <div className="px-3 py-2">
                <p className="text-sm font-semibold text-ink">{user.name}</p>
                <p className="truncate text-xs text-ink-muted">{user.email}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-ink transition hover:bg-page hover:text-danger"
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {isMenuOpen ? <MobileNav role={user.role} onClose={() => setIsMenuOpen(false)} onSignOut={logout} /> : null}
    </header>
  );
}

// The drawer only exists below lg, so it is rendered on demand rather than kept hidden in the dom.
function MobileNav({ role, onClose, onSignOut }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-ink/30" onClick={onClose} />

      <nav aria-label="Main" className="absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-card p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold tracking-wide text-ink">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-primary text-white">
              <HeartPulse size={18} aria-hidden="true" />
            </span>
            EMR
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-pill p-1.5 text-ink-muted transition hover:bg-page hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex flex-1 flex-col gap-1">
          {navItemsFor(role).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-primary text-white' : 'text-ink-muted hover:bg-page hover:text-ink'
                }`
              }
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>

        <Button variant="secondary" className="mt-4 w-full" onClick={onSignOut}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </Button>
      </nav>
    </div>
  );
}
