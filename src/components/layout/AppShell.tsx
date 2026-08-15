import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { IdentitySwapBanner } from '@/components/auth/IdentitySwapBanner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useFocusTrap } from '@/lib/use-focus-trap';

const COLLAPSE_KEY = 'wurxmediahub-sidebar-collapsed';

/**
 * Frame for every signed-in screen.
 *
 * A rail on desktop that collapses to icons, a drawer on mobile. The product is
 * going to grow a lot of sections (brand hubs, numbers, leaderboards, offers,
 * uploads), and a top bar has nowhere to put them, so navigation is vertical
 * from the start rather than being retrofitted once it hurts.
 *
 * The shell is mounted once and is never keyed on the session. A token refresh
 * must not remount it, or a half-typed form disappears. See CLAUDE.md
 * "Auth rules".
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { claims, signOut } = useAuth();
  const { data: profile } = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const drawerRef = useRef<HTMLElement>(null);

  // The drawer covers the page, so Tab must not walk out of it into content
  // the user cannot see. Focus lands on the first nav link, not the close
  // button, and returns to the menu trigger when it shuts.
  useFocusTrap(drawerRef, { active: drawerOpen, initialSelector: 'a[href]' });

  // Read once, synchronously, so the rail does not flash open then snap shut
  // on every navigation for someone who prefers it collapsed.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // The profile row wins over the JWT claim wherever both exist. Claims are
  // only refreshed with the token, roughly hourly, so a creator approved a
  // minute ago would otherwise still be shown as an applicant here while their
  // dashboard already says otherwise.
  const role = profile?.role ?? claims?.role;

  // Changing screen closes the drawer. Without this it stays open over the
  // page you just asked for.
  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [drawerOpen]);

  const handleSignOut = () => {
    setSigningOut(true);
    void signOut();
  };

  const sidebar = (mode: 'rail' | 'drawer') => (
    <AppSidebar
      role={role}
      name={profile?.display_name ?? null}
      email={profile?.email}
      signingOut={signingOut}
      onSignOut={handleSignOut}
      collapsed={mode === 'rail' && collapsed}
      {...(mode === 'drawer'
        ? { onNavigate: () => setDrawerOpen(false), onClose: () => setDrawerOpen(false) }
        : {})}
    />
  );

  return (
    <div
      className={cn(
        // `wx-app` switches the type tokens over to the two self-hosted faces.
        // It lives here so the public landing page never asks for them.
        'wx-app min-h-dvh bg-bg lg:grid',
        // 17.5rem is the design's 280px rail. The old 16rem was cramping the
        // roomier rows it asks for.
        collapsed ? 'lg:grid-cols-[4.5rem_minmax(0,1fr)]' : 'lg:grid-cols-[17.5rem_minmax(0,1fr)]'
      )}
    >
      {/*
        Outside the grid and fixed, so it covers whatever is on screen including
        an open dialog. Signing in elsewhere while half way through approving
        somebody is exactly the case it exists for.
      */}
      <IdentitySwapBanner />

      {/* ------------------------------------------------- desktop rail --- */}
      <aside className="sticky top-0 hidden h-dvh border-r border-line lg:block">
        {sidebar('rail')}
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* --------------------------------------------------------- top --- */}
        {/* Opaque at every width. It is sticky, so a transparent band on
            desktop meant page content scrolled visibly underneath it. */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-1/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* Collapse lives here, not in the rail: at 72px wide the rail has
                no room for a control, and it would vanish exactly when you
                need it to bring the labels back. */}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
              aria-pressed={collapsed}
              className="hidden size-9 place-items-center rounded-lg border border-line text-muted transition-colors duration-200 hover:border-accent hover:text-accent lg:grid"
            >
              {collapsed ? (
                <PanelLeftOpen size={17} aria-hidden />
              ) : (
                <PanelLeftClose size={17} aria-hidden />
              )}
            </button>

            <Link to="/" aria-label="WurxMediaHub home" className="lg:hidden">
              <WurxMark />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className="grid size-10 place-items-center rounded-full border border-line text-muted transition-colors duration-200 hover:border-accent hover:text-accent lg:hidden"
            >
              <Menu size={18} aria-hidden />
            </button>
          </div>
        </header>

        {/* ----------------------------------------------------- content --- */}
        {/* Left aligned against the rail, NOT centred. Centring looks fine on a
            laptop and falls apart the moment somebody zooms out or opens this
            on a wide monitor: the content drifts into the middle and leaves a
            dead gap beside the sidebar, so the two halves stop looking like one
            page. Capped width, hugging the left, behaves at every size. */}
        <main className="min-w-0 flex-1">
          <div className="w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <m.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <m.aside
              key="drawer"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-[min(300px,86vw)] border-r border-line shadow-lg lg:hidden"
            >
              {sidebar('drawer')}
            </m.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
