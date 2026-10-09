import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { Menu } from 'lucide-react';
import { PrismMark } from '@/components/brand/PrismMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { TextSizeMenu } from '@/components/layout/TextSizeMenu';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { HaloBackdrop } from '@/components/auth/HaloBackdrop';
import { IdentitySwapBanner } from '@/components/auth/IdentitySwapBanner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { navForRole, sectionDescriptionFor, sectionTitleFor } from '@/lib/nav';

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

  /*
   * WHAT THE PHONE BAR CARRIES: EVERYWHERE YOU CAN GO.
   *
   * Flattened from the SAME `navForRole` the rail renders, so the bar and the
   * drawer can never disagree about where a link goes — one definition, two
   * renderers. Anything marked `soon` is still dropped: a bottom bar is for
   * places you can actually get to.
   *
   * THE `.slice(0, 5)` IS GONE, and it was a real bug, not a trim. Rashid,
   * 2026-10-08: "why all the the nav bar elements are not in smaller screens?
   * and the navigator is also not accurate. It doesnot point to the tab you are
   * on". Those are one fault. A creator has seven destinations; the cap showed
   * five. Open the sixth — Contests, My content, My profile — and the bar not
   * only lacked the item, it had nothing matching the current URL to light, so
   * the lamp went out and the bar pointed at nothing. Capping a navigator at
   * five only works if nobody can reach a sixth.
   *
   * The bar scrolls sideways instead. `MobileNav` keeps every item at a
   * thumb-sized minimum and brings the active one into view, which beats
   * hiding a destination and lying about where you are.
   */
  const bottomNav = useMemo(
    () =>
      navForRole(profile?.role ?? claims?.role)
        .flatMap((g) => g.items)
        .filter((i) => i.to && !i.soon),
    [profile?.role, claims?.role]
  );

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
        'wx-app min-h-dvh lg:grid',
        /* The halo IS the ground now, on every tab, so nothing here paints
           over it. See the backdrop below. */
        'bg-transparent',
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
        /*
         * 5.5rem COLLAPSED, NOT 4rem, AND THAT IS ARITHMETIC RATHER THAN TASTE.
         *
         * The rail became a floating card with a `p-3` gutter, and the gutter
         * was never paid for. At 4rem the column is 64px, the gutter takes 24
         * of them, and the card is left 40px wide. The footer's own `p-2` takes
         * 16 more, so a 44px control — the tap floor, and the size of the
         * avatar, the sign-out and every nav row — was being asked to fit in 24
         * px. It overflowed by 20px and the card's `overflow-hidden` clipped
         * what spilled, which is the squeezed, off-centre rail Rashid
         * screenshotted.
         *
         * 5.5rem is 88px: minus the 24px gutter leaves a 64px card, minus the
         * 16px padding leaves 48px, so a 44px target sits inside it with 2px to
         * spare on each side. Expanded is untouched at 15rem.
         */
        collapsed ? 'lg:grid-cols-[5.5rem_minmax(0,1fr)]' : 'lg:grid-cols-[15rem_minmax(0,1fr)]'
      )}
    >
      {/*
        Outside the grid and fixed, so it covers whatever is on screen including
        an open dialog. Signing in elsewhere while half way through approving
        somebody is exactly the case it exists for.
      */}
      <IdentitySwapBanner />

      {/*
        THE HALO, ON EVERY TAB. Rashid, 2026-10-08: "each tab must have the halo
        background". It had been wired to Home alone.

        ONE CANVAS FOR THE WHOLE SHELL, mounted here rather than per route, so
        moving between tabs does not tear down a WebGL context and start a new
        swirl — the ground stays put and the content changes on top of it. The
        same reason the theme switch repaints rather than rebuilds.

        FULL VIEWPORT, UNDER THE RAIL TOO. It used to stop at the content column
        while the rail and the top bar painted their own grounds, which drew a
        hard seam straight down the page at the rail's edge. One ground, three
        translucent layers above it.

        `subtle` because there is real work on top of this now, not one sign-in
        card. At full strength the swirl is a rainbow smear behind live numbers:
        it was fighting the data and dragging yellows and greens onto a screen
        whose palette has neither. `-z-10` keeps it under every card and
        `pointer-events-none` keeps it out of the way; the component itself
        skips the download entirely under reduced motion or save-data.
      */}
      <HaloBackdrop intensity="subtle" className="pointer-events-none fixed inset-0 -z-10" />

      {/* ------------------------------------------------- desktop rail --- */}
      {/*
        A CARD ON THE BACKGROUND, not a panel welded to the page edge. Rashid,
        2026-10-08: "The side bar must be like a card placed on the background
        on the left side of the page."

        So the `border-r` is gone — that rule was a dark line down the full
        height of the screen, and with the halo now running underneath the rail
        it was the seam that made the shell look like two pasted-together
        screens — and the rail floats inside its own padding instead, on the
        same neomorphic material as every other card in the product.

        `h-[calc(100dvh-1.5rem)]` rather than `h-dvh`, because the card has to
        stop short of both edges or the gap only appears at the top and it
        reads as a panel that slipped down rather than a card.
      */}
      <aside className="sticky top-0 hidden h-dvh p-3 lg:block">
        <div className="wx-neo-raised flex h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl">
          {sidebar('rail')}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* --------------------------------------------------------- top --- */}
        {/*
          A CARD, LIKE THE RAIL. Rashid circled the top-left corner.

          The bar used to paint a full-bleed band across the content column
          only, so it stopped dead against the rail and left an L-shaped step
          there: header band to the right, page ground to the left, a hard
          vertical edge between them. Once the rail became a floating card that
          corner was the last seam in the shell.

          So the bar floats too, on the same material, with the same gutter and
          the same radius. It is opaque — `wx-neo-raised` paints
          `--wx-surface-1` — which is what stops content showing through as it
          scrolls under, so the old `backdrop-blur-xl` is gone with it. That is
          worth having: a `backdrop-filter` anywhere above the vendored admin
          app has broken its layout three times, and this header is the nearest
          ancestor to it.

          `top-0`, NOT `top-3`, AND THAT IS A BUG FIX. This used to stick at
          `top-3` to keep the gutter while stuck, on the reasoning that an
          opaque card stops content showing through. It does stop it showing
          THROUGH. It does nothing about the 12px window the offset leaves
          ABOVE the card, and page content scrolled straight across it: a strip
          of live, half-cut text sliding along the top of the screen on every
          screen in the product. Rashid caught it on Reporting, where "All
          Brands" and the month nav were sliced in half along that line, but it
          was never about Reporting. Reproduced on My numbers before touching
          anything, by asking the browser what it painted six pixels above the
          card: page content, at every scroll position past the first.

          `mt-3` still gives the gutter at rest, which is where the floating
          card is actually looked at. Once you scroll, the card meets the top
          edge and there is no window left to leak through.
        */}
        <header className="wx-neo-raised sticky top-0 z-40 mx-3 mt-3 flex h-14 shrink-0 items-center justify-between gap-3 rounded-2xl px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {/* The mark stays on a phone, where there is no rail to carry it.
                On desktop the rail has it, and it is the collapse control. */}
            <Link to="/" aria-label="WurxMediaHub home" className="shrink-0 lg:hidden">
              <PrismMark />
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

          {/*
            WHERE PAID COLLABS PUTS ITS OWN CHROME.

            Rashid, 2026-08-28, on the embedded WurxBase screen: *"the header as
            u see should be at top replace our simple header but the replacement
            means simple write wurx creator database in same way as we have for
            our wurxbase no need to have logo because we already have in left
            side the notification and clock should obviulsy exist... i want to
            give it native look of our own app now"*.

            So that screen's header is PORTALED in here rather than drawn as a
            second bar under this one. It arrives already carrying its wordmark,
            its bell and its activity clock; `wurxbase-chrome.css` strips off
            the logo, the app name, the user chip and the sign-out that our own
            shell already provides three inches to the left.

            An empty div on every other screen, which costs nothing and keeps
            this file from knowing anything about that route.
          */}
          <div id="wurxbase-topbar-slot" className="contents" />

          <div className="flex items-center gap-2">
            <TextSizeMenu />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              /* `size-11` is the 44px tap floor. It was `size-10`, and it now
                 sits beside a ThemeToggle and a TextSizeMenu that are both 44px,
                 so it was the odd one out as well as under the floor. The border
                 is gone with every other border in the app; the neomorphic
                 material carries the shape. */
              className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent grid size-11 place-items-center rounded-full transition-colors duration-200 lg:hidden"
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
          {/* `pb-24 lg:pb-0` clears the phone bottom bar. Without it the last
              card on every screen sits underneath the nav and cannot be read,
              which is the classic bottom-navigation bug. */}
          {/* `px-3` at every width, matching the header card's `mx-3` and the
              rail's `p-3`, so the rail, the bar and the work all line up on one
              gutter. It was `px-4 sm:px-6 lg:px-8`, which left the content
              sitting inboard of the bar above it at every breakpoint. */}
          {/* The bottom clearance is TIED TO THE BAR, not a guess. `pb-24` was
              a flat 96px against a bar of about 56px plus the safe-area inset —
              fine at the default text size, but the bar is sized in rem and
              grows with the text-size control, so at Large it could creep past
              96px and sit on top of the last card. This cannot drift apart. */}
          {/* The bar is about 3.5rem tall and now floats 0.75rem above the
              safe area, so the clearance is the bar plus both gutters. It was
              4.5rem, from when the bar sat flush against the window edge. */}
          <div className="w-full px-3 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:py-5 lg:pb-5">
            {children}
          </div>
        </main>
      </div>

      {/*
        THE PHONE BAR. Rashid, 2026-10-08: the limelight treatment on phones,
        the traditional rail on anything larger.

        EVERY DESTINATION, not a chosen few — see `bottomNav` above for why the
        five-item cap had to go. Items come from the same `navForRole`
        definition the rail uses, so the two can never drift apart: one source,
        two renderers.
      */}
      {bottomNav.length > 0 ? <MobileNav items={bottomNav} /> : null}

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
              /* `bg-bg` lives here now that `AppSidebar` paints nothing of its
                 own. The drawer slides over live content, so unlike the rail it
                 has to be fully opaque. */
              /* rem, not px, so the drawer widens with the text-size setting
                 instead of clipping bigger labels at a fixed 300px. */
              className="bg-bg fixed inset-y-0 left-0 z-50 w-[min(18.75rem,86vw)] shadow-lg lg:hidden"
            >
              {sidebar('drawer')}
            </m.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
