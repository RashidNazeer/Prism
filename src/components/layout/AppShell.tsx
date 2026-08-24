import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { Menu } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { TextSizeMenu } from '@/components/layout/TextSizeMenu';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { IdentitySwapBanner } from '@/components/auth/IdentitySwapBanner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { sectionDescriptionFor, sectionTitleFor } from '@/lib/nav';

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
      {...(mode === 'rail' ? { onToggleCollapse: () => setCollapsed((v) => !v) } : {})}
      {...(mode === 'drawer'
        ? { onNavigate: () => setDrawerOpen(false), onClose: () => setDrawerOpen(false) }
        : {})}
    />
  );

  /*
   * THE BAR NAMES THE SECTION NOW, in the menu's own words.
   *
   * Rashid, 2026-08-16: put the section name where the collapse arrow was, with
   * an underline, and delete the title row and the description row every screen
   * was drawing below it. Those two rows cost roughly 120px on every screen in
   * the product, to repeat a word the lit menu row was already saying.
   *
   * This is the page's real `<h1>`. There is exactly one on screen, it changes
   * with the route, and a screen reader still hears the section named on
   * arrival, so nothing was traded away for the space. Record screens keep their
   * own name in the body as an `<h2>`, because the bar answers "where am I",
   * not "which one is open".
   */
  const section = sectionTitleFor(role, pathname);
  const description = sectionDescriptionFor(role, pathname);

  return (
    <div
      className={cn(
        // `wx-app` switches the type tokens over to the two self-hosted faces.
        // It lives here so the public landing page never asks for them.
        'wx-app min-h-dvh bg-bg lg:grid',
        /*
         * 15rem, down from 17.5rem on 2026-08-16. Rashid: the rail is too wide
         * and there is a lot of dead space to the right of every label, which
         * the screenshot bore out. 240px still fits the longest label we have
         * ("Brand hubs") on one line beside its icon, and hands 40px back to
         * the work on every screen.
         *
         * It is `rem`, so it follows the text-size setting: somebody reading at
         * Large gets a rail with room for the bigger words rather than a fixed
         * 240px box with clipped labels in it.
         */
        collapsed ? 'lg:grid-cols-[4rem_minmax(0,1fr)]' : 'lg:grid-cols-[15rem_minmax(0,1fr)]'
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
        <header className="border-line bg-surface-1/90 sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* The mark stays on a phone, where there is no rail to carry it.
                On desktop the rail has it, and it is the collapse control. */}
            <Link to="/" aria-label="WurxMediaHub home" className="shrink-0 lg:hidden">
              <WurxMark />
            </Link>

            {section ? (
              // `min-w-0 truncate`, unchanged from before the description was
              // added. `shrink-0` would stop the name truncating and push it
              // out of a narrow bar instead, and this header is shared with
              // every admin screen, whose names nobody has re-measured.
              <h1 className="font-display relative min-w-0 truncate py-1 text-[1.0625rem] leading-none font-bold tracking-[-0.01em] sm:text-[1.1875rem]">
                {section}
                {/* The underline he asked for. Under the WORD, not across the
                    bar, so it reads as the name of where you are rather than as
                    another rule under a rule. */}
                <span
                  aria-hidden
                  className="bg-accent absolute inset-x-0 -bottom-1 h-[2px] rounded-full"
                />
              </h1>
            ) : null}

            {/*
              THE SECTION'S ONE LINE, IN THE BAR RATHER THAN ON THE PAGE.

              Rashid, on the creator Contests screen: "write this everything.
              line in header and remove Contests ... as we did in admin side to
              reduce the space". A screen that draws its own title and blurb
              spends the top of every page repeating the lit menu row and
              pushes the work down; here it costs no vertical space at all.

              Hidden below `md`. On a phone the bar is already the mark, the
              name and a menu button, and a sentence squeezed between them
              would truncate to nothing useful. The name alone is the answer at
              that width, which is why this is decoration rather than the only
              place the information lives.
            */}
            {section && description ? (
              <>
                <span aria-hidden className="bg-line hidden h-4 w-px shrink-0 md:block" />
                <p className="text-muted hidden min-w-0 truncate text-[0.8125rem] md:block">
                  {description}
                </p>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <TextSizeMenu />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className="border-line text-muted hover:border-accent hover:text-accent grid size-10 place-items-center rounded-full border transition-colors duration-200 lg:hidden"
            >
              <Menu size={18} aria-hidden />
            </button>
          </div>
        </header>

        {/* ----------------------------------------------------- content --- */}
        {/*
          FULL WIDTH SINCE 2026-08-16, and the cap is gone rather than raised.

          It was `max-w-7xl`. Rashid zoomed out, saw the content stop at 1280px
          with the rest of the monitor empty beside it, and asked for the width
          back so more cards fit on a row. He is right, and the old rule in
          CLAUDE.md was aiming at the same thing from the other side: it said
          "left aligned, never centred" precisely so zooming out could not open
          a dead gap. A cap does open one, just on the other edge. No cap opens
          none at any width or any zoom, which is what the rule was for.

          Still `min-w-0`, so a wide table inside scrolls in its own container
          rather than pushing the page sideways.
        */}
        <main className="min-w-0 flex-1">
          {/* Tightened 2026-08-15. Rashid, more than once: do not give extra
              spaces, show the content early. It was py-6/py-8 under a top bar
              that already costs 57px, so every screen in the product started a
              third of the way down. */}
          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8">{children}</div>
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
