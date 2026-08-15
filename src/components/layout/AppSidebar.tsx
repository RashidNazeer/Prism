import { Link, useLocation } from 'react-router';
import { LogOut, Plus, X } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { cn } from '@/lib/utils';
import { isNavItemActive, navForRole, type NavItem } from '@/lib/nav';
import type { AppRole } from '@/lib/auth/auth-context';

/**
 * The product's navigation.
 *
 * REBUILT 2026-08-15 against the design Rashid supplied in `MY UI/All Contest`,
 * because the old one was, in his words, very boring. What came across from that
 * design: the 280px rail, the brand block with a subtitle under the wordmark,
 * the gradient call to action at the top, roomier rows with the icon and label
 * on one line, and an active row drawn as a tinted pill WITH a solid bar on its
 * inner edge rather than a tint alone.
 *
 * WHAT DID NOT COME ACROSS IS THE PALETTE, and that was his call: the design is
 * indigo and violet on navy, and Wurx is gold on near-black, locked to
 * wurxmedia.com in CLAUDE.md. So every surface, gradient and glow here is a
 * `--wx-*` token and the design's structure is what was copied.
 *
 * BOTH THEMES, as he asked. The glass utilities invert their wash in light mode
 * rather than tinting the dark one, because a white wash over paper is nothing
 * at all. See `tokens.css`.
 *
 * One component for the fixed desktop rail and the mobile drawer, so the two can
 * never drift apart. `collapsed` shrinks it to icons only on wide screens; the
 * drawer is never collapsed, because a drawer you have opened on purpose should
 * show you words.
 */

/**
 * The gradient button at the top of the rail.
 *
 * STAFF NO LONGER HAVE ONE, at Rashid's request on 2026-08-15: creating a
 * contest belongs on the contests screen, at the top right, beside the thing it
 * creates. A global button in the menu that navigates somewhere else first was
 * a worse version of the same idea, and it also collided with the real "New
 * contest" button on the brand's Contests tab.
 *
 * A CREATOR KEEPS THEIRS, because "Add a video" genuinely is one tap from
 * anywhere and is the thing they do most. The roles that create nothing get no
 * button rather than one that apologises when pressed.
 */
function createActionFor(role: AppRole | undefined): { label: string; to: string } | null {
  if (role === 'creator') return { label: 'Add a video', to: '/app/content' };
  return null;
}

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
  const create = createActionFor(role);

  return (
    <div className="bg-bg flex h-full flex-col">
      {/* ---------------------------------------------------------- brand -- */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-3',
          collapsed ? 'justify-center px-2 py-5' : 'justify-between px-5 py-6'
        )}
      >
        <Link
          to="/"
          aria-label="WurxMediaHub home"
          onClick={onNavigate}
          className={cn('flex items-center gap-3', collapsed && 'justify-center')}
        >
          {/* Collapsed there is no room for the wordmark, so show the mascot
              alone rather than a half-cut "WURX". */}
          <WurxMark markOnly={collapsed} height={collapsed ? 28 : 26} />
          {/* The design puts a quiet subtitle under the wordmark. It says what
              the product is to somebody who has just been let in. */}
          {!collapsed ? (
            <span className="text-faint -mt-0.5 hidden text-[11px] leading-none font-medium sm:block">
              Creator Platform
            </span>
          ) : null}
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-muted hover:text-accent grid size-11 shrink-0 place-items-center rounded-full transition-colors"
          >
            <X size={18} aria-hidden />
          </button>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ cta -- */}
      {create ? (
        <div className={cn('shrink-0 pb-4', collapsed ? 'px-2' : 'px-4')}>
          <Link
            to={create.to}
            onClick={onNavigate}
            title={collapsed ? create.label : undefined}
            className={cn(
              'wx-gradient text-on-accent ease-brand flex min-h-11 items-center justify-center gap-2',
              'rounded-xl text-[13px] font-semibold shadow-md transition-all duration-300',
              'hover:shadow-lg active:translate-y-px',
              collapsed ? 'w-full px-0' : 'w-full px-4'
            )}
          >
            <Plus size={16} aria-hidden className="shrink-0" />
            <span className={collapsed ? 'sr-only' : undefined}>{create.label}</span>
          </Link>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ nav -- */}
      <nav
        aria-label="Main"
        className={cn('flex-1 overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}
      >
        {groups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            {collapsed ? (
              <div className="bg-line mx-auto mb-2 h-px w-6" aria-hidden />
            ) : (
              <p className="text-faint px-3 pb-2 font-mono text-[10px] tracking-[0.16em] uppercase">
                {group.label}
              </p>
            )}
            <ul className="grid gap-1">
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
          share a word. Role and tier belong on the profile screen, not here.

          The design's footer is a divider with Settings and Logout under it.
          Ours keeps the identity, because a product where you can be signed in
          as two different people in two tabs had better say which one you are. */}
      <div className={cn('border-line shrink-0 border-t', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? (
          <div className="grid gap-1.5">
            <p
              title={`${name || 'Signed in'}${email ? ` (${email})` : ''}`}
              className="bg-accent-soft text-accent mx-auto grid size-9 place-items-center rounded-full font-mono text-[13px] font-bold uppercase"
            >
              {initial}
            </p>
            <button
              type="button"
              disabled={signingOut}
              onClick={onSignOut}
              title="Sign out"
              className="text-muted hover:bg-surface-2 hover:text-danger mx-auto grid size-11 place-items-center rounded-lg transition-colors duration-200 disabled:opacity-50"
            >
              <LogOut size={15} aria-hidden />
              <span className="sr-only">Sign out</span>
            </button>
          </div>
        ) : (
          <div className="wx-glass-panel flex items-center gap-2.5 rounded-xl py-2 pr-1.5 pl-2.5">
            <span
              aria-hidden
              className="bg-accent-soft text-accent grid size-9 shrink-0 place-items-center rounded-full font-mono text-[13px] font-bold uppercase"
            >
              {initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">
                {name || 'Signed in'}
              </span>
              <span className="text-faint block truncate text-[11px]">{email}</span>
            </span>
            <button
              type="button"
              disabled={signingOut}
              onClick={onSignOut}
              title="Sign out"
              // Turns danger on hover, the way the design's Logout does. It is
              // the one row in here that ends a session.
              className="text-muted hover:bg-surface-1 hover:text-danger grid size-11 shrink-0 place-items-center rounded-lg transition-colors duration-200 disabled:opacity-50"
            >
              <LogOut size={15} aria-hidden />
              <span className="sr-only">{signingOut ? 'Signing out' : 'Sign out'}</span>
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
  /*
   * py-3 and gap-3, from the design, against py-2.5 and gap-3 before. It reads
   * as a deliberate list rather than a dense one, which is most of why the old
   * rail felt flat. `min-h-11` keeps every row a legal tap target on a phone,
   * which the responsive suite asserts.
   */
  const base = cn(
    'ease-brand relative flex min-h-11 items-center gap-3 rounded-xl py-3 text-[14px]',
    'transition-all duration-200',
    collapsed ? 'justify-center px-0' : 'px-4'
  );

  // Not built yet. Rendered as text, never as a link: a nav item that navigates
  // to nothing is worse than one that plainly says "not yet".
  if (!item.to) {
    return (
      <span
        className={cn(base, 'text-faint cursor-default')}
        aria-disabled="true"
        title={collapsed ? `${item.label} (${item.soon ?? 'later'})` : undefined}
      >
        <item.icon size={17} aria-hidden className="shrink-0" />
        {collapsed ? (
          <span className="sr-only">
            {item.label}, {item.soon ?? 'not yet built'}
          </span>
        ) : (
          <>
            <span className="truncate">{item.label}</span>
            {item.soon ? (
              <span className="border-line text-faint ml-auto shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] uppercase">
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
          ? 'bg-accent-soft text-accent font-semibold'
          : 'text-muted hover:bg-surface-2 hover:text-text'
      )}
    >
      {/*
        THE INDICATOR BAR, which is the piece of the design that makes the
        active row read at a glance rather than as a slightly different shade.
        The design puts it on the outer edge; it sits on the INNER edge here so
        it survives the collapsed rail, where the outer edge is the screen.
      */}
      {active ? (
        <span
          aria-hidden
          className="bg-accent absolute inset-y-1.5 left-0 w-[3px] rounded-full"
        />
      ) : null}
      <item.icon size={17} aria-hidden className="shrink-0" />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
    </Link>
  );
}
