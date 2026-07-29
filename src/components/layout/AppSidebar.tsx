import { Link, useLocation } from 'react-router';
import { LogOut, X } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { cn } from '@/lib/utils';
import { isNavItemActive, navForRole, type NavItem } from '@/lib/nav';
import type { AppRole, CreatorTier } from '@/lib/auth/auth-context';

const ROLE_LABEL: Record<AppRole, string> = {
  applicant: 'Applicant',
  creator: 'Creator',
  creative_strategist: 'Creative strategist',
  ops: 'Ops',
  admin: 'Admin',
};

const TIER_LABEL: Record<CreatorTier, string> = {
  creator: 'Creator',
  rising: 'Rising',
  pro: 'Pro',
  elite: 'Elite',
};

/**
 * The product's navigation.
 *
 * One component for both the fixed desktop rail and the mobile drawer, so the
 * two can never drift apart. `onNavigate` closes the drawer after a tap; on
 * desktop nothing is passed and nothing closes.
 */
export function AppSidebar({
  role,
  tier,
  name,
  email,
  signingOut,
  onSignOut,
  onNavigate,
  onClose,
}: {
  role: AppRole | undefined;
  tier: CreatorTier | null;
  name: string | null;
  email: string | undefined;
  signingOut: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
  /** Present only in the mobile drawer. Swaps the theme toggle for a close. */
  onClose?: () => void;
}) {
  const { pathname } = useLocation();
  const groups = navForRole(role);

  return (
    <div className="flex h-full flex-col bg-surface-1">
      {/* ---------------------------------------------------------- brand -- */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
        <Link to="/" aria-label="WurxMediaHub home" onClick={onNavigate}>
          <WurxMark />
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
        ) : (
          <ThemeToggle />
        )}
      </div>

      {/* ------------------------------------------------------------ nav -- */}
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <p className="px-3 pb-2 font-mono text-[10px] tracking-[0.16em] text-faint uppercase">
              {group.label}
            </p>
            <ul className="grid gap-0.5">
              {group.items.map((item) => (
                <li key={item.label}>
                  <NavRow
                    item={item}
                    active={isNavItemActive(item, pathname)}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* ----------------------------------------------------------- user -- */}
      <div className="shrink-0 border-t border-line p-3">
        <div className="rounded-xl bg-surface-2 px-3.5 py-3">
          <p className="truncate text-[13px] font-semibold">{name || email || 'Signed in'}</p>
          <p className="mt-0.5 truncate text-[11px] text-faint">{email}</p>
          {role ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] uppercase">
              <span className="rounded-full border border-line px-2 py-0.5 text-muted">
                {ROLE_LABEL[role]}
              </span>
              {tier ? (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
                  {TIER_LABEL[tier]}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={signingOut}
          onClick={onSignOut}
          className="mt-1.5 flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-accent disabled:opacity-50"
        >
          <LogOut size={15} aria-hidden />
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const base =
    'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] transition-colors duration-200';

  // Not built yet. Rendered as text, never as a link: a nav item that navigates
  // to nothing is worse than one that plainly says "not yet".
  if (!item.to) {
    return (
      <span className={cn(base, 'cursor-default text-faint')} aria-disabled="true">
        <item.icon size={16} aria-hidden className="shrink-0" />
        <span className="truncate">{item.label}</span>
        {item.soon ? (
          <span className="ml-auto shrink-0 rounded-full border border-line px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-faint uppercase">
            {item.soon}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        base,
        active
          ? 'bg-accent-soft font-semibold text-accent'
          : 'text-muted hover:bg-surface-2 hover:text-text'
      )}
    >
      <item.icon size={16} aria-hidden className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
