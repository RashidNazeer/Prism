import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { Menu } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';

/**
 * Frame for every signed-in screen.
 *
 * A fixed rail on desktop, a drawer on mobile. The product is going to grow a
 * lot of sections (brand hubs, numbers, leaderboards, offers, uploads), and a
 * top bar has nowhere to put them, so navigation is vertical from the start
 * rather than being retrofitted once it hurts.
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

  // The profile row wins over the JWT claim wherever both exist. Claims are
  // only refreshed with the token, roughly hourly, so a creator approved a
  // minute ago would otherwise still be shown as an applicant here while their
  // dashboard already says otherwise.
  const role = profile?.role ?? claims?.role;
  const tier = profile ? profile.tier : (claims?.tier ?? null);

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

  const sidebar = (inDrawer = false) => (
    <AppSidebar
      role={role}
      tier={tier}
      name={profile?.display_name ?? null}
      email={profile?.email}
      signingOut={signingOut}
      onSignOut={handleSignOut}
      {...(inDrawer
        ? { onNavigate: () => setDrawerOpen(false), onClose: () => setDrawerOpen(false) }
        : {})}
    />
  );

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* ------------------------------------------------- desktop rail --- */}
      <aside className="sticky top-0 hidden h-dvh border-r border-line lg:block">
        {sidebar()}
      </aside>

      {/* --------------------------------------------------- mobile bar --- */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface-1 px-5 lg:hidden">
        <Link to="/" aria-label="WurxMediaHub home">
          <WurxMark />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="grid size-10 place-items-center rounded-full border border-line text-muted transition-colors duration-200 hover:border-accent hover:text-accent"
          >
            <Menu size={18} aria-hidden />
          </button>
        </div>
      </header>

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
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-[min(300px,86vw)] border-r border-line shadow-lg lg:hidden"
            >
              {sidebar(true)}
            </m.aside>
          </>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------ content --- */}
      <main className="min-w-0">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
      </main>
    </div>
  );
}
