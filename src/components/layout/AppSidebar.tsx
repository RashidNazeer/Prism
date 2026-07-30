import { Link, useLocation } from 'react-router';
import { LogOut, X } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { cn } from '@/lib/utils';
import { isNavItemActive, navForRole, type NavItem } from '@/lib/nav';
import type { AppRole } from '@/lib/auth/auth-context';

/**
 * The product's navigation.
 *
 * One component for the fixed desktop rail and the mobile drawer, so the two
 * can never drift apart. `collapsed` shrinks it to icons only on wide screens;
 * the drawer is never collapsed, because a drawer you have opened on purpose
 * should show you words.
 */
export function AppSidebar({
  role,
  name,
  email,
  signingOut,
  onSignOut,
  onNavigate,
  onClose,
  collapsed = false,
}: {
  role: AppRole | undefined;
  name: string | null;
  email: string | undefined;
  signingOut: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
  /** Present only in the mobile drawer. Adds a close button. */
  onClose?: () => void;
  collapsed?: boolean;
}) {
  const { pathname } = useLocation();
  const groups = navForRole(role);
  const initial = (name || email || '?').trim().charAt(0) || '?';

  return (
    <div className="flex h-full flex-col bg-surface-1">
      {/* ---------------------------------------------------------- brand -- */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-line',
          collapsed ? 'justify-center px-2' : 'justify-between px-5'
        )}
      >
        <Link
          to="/"
          aria-label="WurxMediaHub home"
          onClick={onNavigate}
          className={collapsed ? 'grid place-items-center' : undefined}
        >
          {/* Collapsed there is no room for the wordmark, so show the mascot
              alone rather than a half-cut "WURX". */}
          <WurxMark markOnly={collapsed} height={collapsed ? 28 : 26} />
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:text-accent"
          >
            <X size={18} aria-hidden />
          </button>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ nav -- */}
      <nav
        aria-label="Main"
        className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}
      >
        {groups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
            ) : (
              <p className="px-3 pb-2 font-mono text-[10px] tracking-[0.16em] text-faint uppercase">
                {group.label}
              </p>
            )}
            <ul className="grid gap-0.5">
              {group.items.map((item) => (
                <li key={item.label}>
                  <NavRow
                    item={item}
                    active={isNavItemActive(item, pathname)}
                    collapsed={collapsed}
                    {...(onNavigate ? { onNavigate } : {})}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* ----------------------------------------------------------- user -- */}
      {/* One line: avatar, who you are, and the way out. This used to be a card
          with the name, the email and two chips stacked under it, which on a
          creator read "CREATOR  CREATOR" because the role and the starting tier
          share a word. Role and tier belong on the profile screen, not here. */}
      <div className={cn('shrink-0 border-t border-line', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? (
          <div className="grid gap-1.5">
            <p
              title={`${name || 'Signed in'}${email ? ` (${email})` : ''}`}
              className="mx-auto grid size-9 place-items-center rounded-full bg-accent-soft font-mono text-[13px] font-bold text-accent uppercase"
            >
              {initial}
            </p>
            <button
              type="button"
              disabled={signingOut}
              onClick={onSignOut}
              title="Sign out"
              className="mx-auto grid size-9 place-items-center rounded-lg text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-accent disabled:opacity-50"
            >
              <LogOut size={15} aria-hidden />
              <span className="sr-only">Sign out</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 py-2 pr-1.5 pl-2.5">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-[13px] font-bold text-accent uppercase"
            >
              {initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">
                {name || 'Signed in'}
              </span>
              <span className="block truncate text-[11px] text-faint">{email}</span>
            </span>
            <button
              type="button"
              disabled={signingOut}
              onClick={onSignOut}
              title="Sign out"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors duration-200 hover:bg-surface-1 hover:text-accent disabled:opacity-50"
            >
              <LogOut size={15} aria-hidden />
              <span className="sr-only">
                {signingOut ? 'Signing out' : 'Sign out'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NavRow({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const base = cn(
    'flex items-center gap-3 rounded-xl py-2.5 text-[14px] transition-colors duration-200',
    collapsed ? 'justify-center px-0' : 'px-3.5'
  );

  // Not built yet. Rendered as text, never as a link: a nav item that navigates
  // to nothing is worse than one that plainly says "not yet".
  if (!item.to) {
    return (
      <span
        className={cn(base, 'cursor-default text-faint')}
        aria-disabled="true"
        title={collapsed ? `${item.label} (${item.soon ?? 'later'})` : undefined}
      >
        <item.icon size={16} aria-hidden className="shrink-0" />
        {collapsed ? (
          <span className="sr-only">
            {item.label}, {item.soon ?? 'not yet built'}
          </span>
        ) : (
          <>
            <span className="truncate">{item.label}</span>
            {item.soon ? (
              <span className="ml-auto shrink-0 rounded-full border border-line px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-faint uppercase">
                {item.soon}
              </span>
            ) : null}
          </>
        )}
      </span>
    );
  }

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        base,
        active
          ? 'bg-accent-soft font-semibold text-accent'
          : 'text-muted hover:bg-surface-2 hover:text-text'
      )}
    >
      <item.icon size={16} aria-hidden className="shrink-0" />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
    </Link>
  );
}
