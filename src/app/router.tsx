import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouteFallback } from '@/components/layout/RouteFallback';
import { ShellLayout } from '@/components/layout/ShellLayout';
import { RequireAuth, RedirectIfSignedIn } from '@/components/auth/RequireAuth';

/**
 * Route table.
 *
 * Every screen is lazy so it ships as its own chunk: a creator opening the
 * landing page should never download the admin dashboard. `HydrateFallback`
 * renders the skeleton while a chunk is in flight, never a bare spinner.
 *
 * Role lists on the guards decide WHICH SCREEN to show. They are not the
 * security boundary. Every query underneath is still filtered by row level
 * security, so a tampered token buys an empty page and nothing else.
 */
/**
 * Load a screen, and survive the deploy that happened while the tab was open.
 *
 * THE FAILURE, seen on dev on 2026-08-13 after nine deploys in an evening:
 *
 *   Unexpected Application Error!
 *   Failed to fetch dynamically imported module: /assets/Dashboard-LYjx_st3.js
 *
 * Every screen here is its own file with a content hash in its name, so a
 * deploy renames all of them. A tab opened before that deploy still holds the
 * old index, and the moment it needs a screen it has not downloaded yet it asks
 * for a filename that no longer exists on the CDN. Signing in and signing out
 * are exactly those moments, which is why it looked like an auth bug.
 *
 * It will happen to real creators too, and more often than it did to us: a
 * phone keeps a tab alive for days.
 *
 * So: try again once in case the network simply dropped the request, and if it
 * still fails, reload. A reload fetches the current index and therefore the
 * current filenames, and it keeps the URL, so somebody signing in still lands
 * where they were going. The session lives in localStorage and survives it.
 *
 * The timestamp guard is what stops a genuinely broken deploy turning into an
 * infinite refresh: at most one reload per tab per minute, and after that the
 * error is allowed through to the boundary where somebody will see it.
 */
const RELOAD_KEY = 'wx.chunk-reload';

/**
 * A screen, loaded WITHOUT blocking the navigation.
 *
 * THIS IS THE FIX FOR THE LAG RASHID KEPT REPORTING, and the difference is the
 * order two things happen in rather than how fast either of them is.
 *
 * React Router's route-level `lazy` waits for the module before it commits the
 * navigation. Measured with `pnpm measure:nav` on 2026-08-15: 291ms from click
 * to the URL changing on a first visit, 11ms once the chunk was in memory, and
 * click-to-URL and click-to-painted were the SAME number. So for a third of a
 * second nothing on screen moved at all, which is why it read as the app
 * hanging rather than loading.
 *
 * `React.lazy` behind the Suspense boundary in `ShellLayout` inverts that: the
 * URL changes immediately, the sidebar and frame stay mounted, the active menu
 * item lights up, and only the content area suspends. Same download, same
 * duration, but the app answers the click.
 *
 * THE DEPLOY RETRY IS UNCHANGED and still matters. A tab open across a deploy
 * asks for a filename that no longer exists on the CDN, so this retries once in
 * case the network simply dropped it, then reloads to pick up the new index.
 * The timestamp guard keeps a genuinely broken deploy from becoming an infinite
 * refresh: at most one reload per tab per minute.
 */
const screen = (load: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(async () => {
    try {
      const mod = await load();
      return { default: mod[name] as React.ComponentType };
    } catch (error) {
      try {
        const mod = await load();
        return { default: mod[name] as React.ComponentType };
      } catch {
        /* Still gone. Fall through to the reload. */
      }
      return reloadOrThrow(error);
    }
  });

/**
 * Shared by both loaders. Reloads once to pick up the current index, or gives
 * up and lets the error reach the boundary where somebody will see it.
 */
function reloadOrThrow(error: unknown): never {
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? '0');
  } catch {
    /* Private mode with storage blocked. Treat it as never reloaded. */
  }

  if (Date.now() - last > 60_000) {
    try {
      window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      /* As above. The reload is still worth attempting. */
    }
    window.location.reload();
    // The reload takes the page, so this never settles. A pending promise stops
    // React rendering an error in the meantime.
    throw new Promise<never>(() => {});
  }

  throw error;
}

/**
 * The blocking loader, kept for the PUBLIC routes only.
 *
 * The landing page, sign in and the rest have no shell to hold still and no
 * sidebar to keep lit, so there is nothing for a Suspense fallback to preserve
 * and blocking until the module is ready avoids a flash of empty page.
 */
const lazyRoute = (load: () => Promise<Record<string, unknown>>, name: string) => async () => {
  try {
    const mod = await load();
    return { Component: mod[name] as React.ComponentType };
  } catch (error) {
    try {
      const mod = await load();
      return { Component: mod[name] as React.ComponentType };
    } catch {
      /* Still gone. Fall through to the reload. */
    }

    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? '0');
    } catch {
      /* Private mode with storage blocked. Treat it as never reloaded. */
    }

    if (Date.now() - last > 60_000) {
      try {
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* As above. The reload is still worth attempting. */
      }
      window.location.reload();
      // The reload takes the page, so this never settles. Returning a pending
      // promise stops the router rendering an error in the meantime.
      return new Promise<never>(() => {});
    }

    throw error;
  }
};

/* ---------------------------------------------------------- the screens -- */
/*
 * Declared once, at module scope, and this is load bearing rather than tidy.
 * `lazy()` called inside the route table would make a NEW component type on
 * every render, and React would unmount and remount the screen each time.
 *
 * The names are prefixed by side because four of them collide: there is an app
 * Brands and an admin Brands, an app BrandHub and an admin BrandHub. They are
 * different screens for different people and mixing them up would show a
 * creator the staff version.
 */
const CreatorDashboard = screen(() => import('@/routes/app/Dashboard'), 'Dashboard');
const CreatorProfile = screen(() => import('@/routes/app/Profile'), 'Profile');
const CreatorBrands = screen(() => import('@/routes/app/Brands'), 'Brands');
const CreatorBrandHub = screen(() => import('@/routes/app/BrandHub'), 'BrandHub');
const CreatorOffers = screen(() => import('@/routes/app/Offers'), 'Offers');
const CreatorContests = screen(() => import('@/routes/app/Contests'), 'Contests');
const CreatorContent = screen(() => import('@/routes/app/Content'), 'Content');
const CreatorNumbers = screen(() => import('@/routes/app/MyNumbers'), 'MyNumbers');
const CreatorBoard = screen(() => import('@/routes/app/Leaderboards'), 'Leaderboards');

const AdminHome = screen(() => import('@/routes/admin/AdminDashboard'), 'AdminDashboard');
const AdminApplications = screen(() => import('@/routes/admin/Applications'), 'Applications');
const AdminApplicationDetail = screen(
  () => import('@/routes/admin/ApplicationDetail'),
  'ApplicationDetail'
);
const AdminAllOffers = screen(() => import('@/routes/admin/AllOffers'), 'AllOffers');
const AdminOfferRequests = screen(() => import('@/routes/admin/OfferRequests'), 'OfferRequests');
const AdminAllContests = screen(() => import('@/routes/admin/AllContests'), 'AllContests');
const AdminContestClaims = screen(() => import('@/routes/admin/ContestClaims'), 'ContestClaims');
const AdminContestRewards = screen(
  () => import('@/routes/admin/ContestRewards'),
  'ContestRewards'
);
const AdminContestSetup = screen(() => import('@/routes/admin/ContestSetup'), 'ContestSetup');
const AdminContent = screen(() => import('@/routes/admin/Content'), 'AdminContent');
const AdminActivity = screen(() => import('@/routes/admin/Activity'), 'Activity');
const AdminTikTok = screen(() => import('@/routes/admin/TikTokSettings'), 'TikTokSettings');
const AdminPaidCollabs = screen(() => import('@/routes/admin/PaidCollabs'), 'PaidCollabs');
const AdminBrands = screen(() => import('@/routes/admin/Brands'), 'Brands');
const AdminBrandHub = screen(() => import('@/routes/admin/BrandHub'), 'BrandHub');
const AdminCreators = screen(() => import('@/routes/admin/Creators'), 'Creators');
const AdminCreatorDetail = screen(() => import('@/routes/admin/CreatorDetail'), 'CreatorDetail');

const StudioHome = screen(() => import('@/routes/studio/StudioHome'), 'StudioHome');

/**
 * START THE DOWNLOAD BEFORE THE CLICK.
 *
 * The layout change above means a cold section answers instantly and then shows
 * a skeleton for about a quarter of a second while its code arrives. This
 * removes the skeleton in the common case: touching a menu item with a pointer,
 * or reaching it with the keyboard, begins the fetch, so by the time the click
 * lands the module is usually already in memory and the screen is simply there.
 *
 * It is the cheap half, not the important half. There is no hover on a phone,
 * which is most creators, and they are the reason the layout change had to be
 * done properly rather than papered over with this.
 *
 * Safe to call as often as you like: an import is cached by the bundler, so
 * repeat calls are a map lookup. Failures are swallowed on purpose, because a
 * prefetch that fails must never surface an error for a screen nobody has asked
 * for yet; the real navigation will retry and report it properly.
 */
const PREFETCH: Record<string, () => Promise<unknown>> = {
  '/app': () => import('@/routes/app/Dashboard'),
  '/app/profile': () => import('@/routes/app/Profile'),
  '/app/brands': () => import('@/routes/app/Brands'),
  '/app/offers': () => import('@/routes/app/Offers'),
  '/app/contests': () => import('@/routes/app/Contests'),
  '/app/content': () => import('@/routes/app/Content'),
  '/app/numbers': () => import('@/routes/app/MyNumbers'),
  '/app/leaderboards': () => import('@/routes/app/Leaderboards'),
  '/admin': () => import('@/routes/admin/AdminDashboard'),
  '/admin/applications': () => import('@/routes/admin/Applications'),
  '/admin/activity': () => import('@/routes/admin/Activity'),
  '/admin/tiktok': () => import('@/routes/admin/TikTokSettings'),
  // Deliberately NOT prefetched: it is a very large vendored bundle and nobody
  // who never opens it should download it on a hover.
  '/admin/offers': () => import('@/routes/admin/AllOffers'),
  '/admin/offers/requests': () => import('@/routes/admin/OfferRequests'),
  '/admin/contests': () => import('@/routes/admin/AllContests'),
  '/admin/contests/claims': () => import('@/routes/admin/ContestClaims'),
  '/admin/contests/rewards': () => import('@/routes/admin/ContestRewards'),
  '/admin/content': () => import('@/routes/admin/Content'),
  '/admin/brands': () => import('@/routes/admin/Brands'),
  '/admin/creators': () => import('@/routes/admin/Creators'),
  '/studio': () => import('@/routes/studio/StudioHome'),
};

export function prefetchRoute(to: string) {
  const load = PREFETCH[to];
  if (load) void load().catch(() => {});
}

export const router = createBrowserRouter([
  /* ------------------------------------------------------------- public -- */
  {
    path: '/',
    HydrateFallback: RouteFallback,
    lazy: lazyRoute(() => import('@/routes/Landing'), 'Landing'),
  },
  /*
   * WHERE TIKTOK SENDS AN ADMIN BACK AFTER THEY AUTHORISE US.
   *
   * PUBLIC ON PURPOSE, and it is the only route in the product that has to be:
   * the browser arrives here straight from tiktok.com and may carry no hub
   * session in that tab. What makes it safe is the single-use `state` nonce,
   * minted by an admin-only edge function and burned server side, rather than
   * this route being hard to reach. See supabase/functions/tiktok-callback.
   */
  {
    path: '/oauth/tiktok/callback',
    HydrateFallback: RouteFallback,
    lazy: lazyRoute(() => import('@/routes/OAuthTikTokCallback'), 'OAuthTikTokCallback'),
  },
  {
    path: '/apply',
    HydrateFallback: RouteFallback,
    lazy: lazyRoute(() => import('@/routes/Apply'), 'Apply'),
  },
  // /signup is the same screen, and deliberately NOT behind the
  // "already signed in? go home" guard.
  //
  // Applying creates the account, so that guard used to fire the instant sign
  // up returned, which is BEFORE the application row is written. The dashboard
  // then mounted, asked whether an application existed, was truthfully told no,
  // and cached that answer, greeting somebody who had just applied with
  // "Finish your application". The form navigates people itself once its work
  // has actually finished.
  {
    path: '/signup',
    HydrateFallback: RouteFallback,
    lazy: lazyRoute(() => import('@/routes/Apply'), 'Apply'),
  },

  /* ------------------------------------------ signed out only (auth) ----- */
  {
    Component: RedirectIfSignedIn,
    children: [
      {
        path: '/login',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/auth/SignIn'), 'SignIn'),
      },
      // The staff door. A separate SCREEN, not a separate lock: it exists so
      // the team is not greeted by a page selling them on applying, and so no
      // sign up route sits anywhere near it. Permission is still decided by row
      // level security and the Edge Function, never by which URL you used.
      {
        path: '/admin/login',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/auth/StaffSignIn'), 'StaffSignIn'),
      },
      {
        path: '/forgot-password',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/auth/ForgotPassword'), 'ForgotPassword'),
      },
    ],
  },

  // Reset lives outside the guard above: arriving on this link creates a
  // temporary session, so a "you are already signed in" redirect would bounce
  // people away from the very page they need.
  {
    path: '/reset-password',
    HydrateFallback: RouteFallback,
    lazy: lazyRoute(() => import('@/routes/auth/ResetPassword'), 'ResetPassword'),
  },

  /* ---------------------------------------------------------- signed in -- */
  /*
   * EVERY SIGNED-IN ROUTE NESTS UNDER `ShellLayout`, added 2026-08-15 to make
   * navigation instant. The shell holds the sidebar, the top bar and the page
   * frame, and it stays mounted across a navigation, so the URL and the active
   * menu item change the moment you click and only the content area suspends.
   * Read the block on `screen()` above for the measurements behind it.
   */
  {
    Component: () => <RequireAuth allow={['applicant', 'creator']} />,
    children: [
      {
        Component: ShellLayout,
        children: [
          {
            path: '/app',
            element: <CreatorDashboard />,
          },
          {
            path: '/app/profile',
            element: <CreatorProfile />,
          },
          // Applicants are allowed onto these routes on purpose, and are shown a
          // "this opens when you are approved" panel instead of the hub.
          //
          // Guarding them with allow={['creator']} would read the role from the
          // JWT, which lags approval by up to an hour, so somebody who had just
          // watched the confetti would be bounced back to their dashboard. The
          // screens read the profile row, which is current, and the database
          // refuses the rows either way.
          {
            path: '/app/brands',
            element: <CreatorBrands />,
          },
          {
            path: '/app/brands/:slug',
            element: <CreatorBrandHub />,
          },
          {
            path: '/app/offers',
            element: <CreatorOffers />,
          },
          // Contests get their own place in the menu on BOTH sides, the same way
          // offers do. Reaching them only by walking into a brand first was the
          // wrong shape and Rashid caught it.
          {
            path: '/app/contests',
            element: <CreatorContests />,
          },
          {
            path: '/app/content',
            element: <CreatorContent />,
          },
          {
            path: '/app/numbers',
            element: <CreatorNumbers />,
          },
          {
            path: '/app/leaderboards',
            element: <CreatorBoard />,
          },
        ],
      },
    ],
  },
  {
    Component: () => <RequireAuth allow={['ops', 'admin']} />,
    children: [
      {
        Component: ShellLayout,
        children: [
      {
        path: '/admin',
        element: <AdminHome />,
      },
      {
        path: '/admin/applications',
        element: <AdminApplications />,
      },
      {
        path: '/admin/applications/:id',
        element: <AdminApplicationDetail />,
      },
      // Offers is a section with two screens: the catalogue of everything we
      // run, and the queue of creators waiting on a decision. They answer
      // different questions and are worked at different times.
      {
        path: '/admin/offers',
        element: <AdminAllOffers />,
      },
      {
        path: '/admin/offers/requests',
        element: <AdminOfferRequests />,
      },
      // Three screens, three jobs: what is running, who is waiting on us, and
      // what it has cost. Different questions, worked at different times of day,
      // and a screen that tries to answer two of them answers neither well.
      {
        path: '/admin/contests',
        element: <AdminAllContests />,
      },
      {
        path: '/admin/contests/claims',
        element: <AdminContestClaims />,
      },
      {
        path: '/admin/contests/rewards',
        element: <AdminContestRewards />,
      },
      {
        path: '/admin/content',
        element: <AdminContent />,
      },
      {
        path: '/admin/activity',
        element: <AdminActivity />,
      },
      {
        path: '/admin/tiktok',
        element: <AdminTikTok />,
      },
      {
        path: '/admin/collabs',
        element: <AdminPaidCollabs />,
      },
      {
        path: '/admin/brands',
        element: <AdminBrands />,
      },
      {
        path: '/admin/brands/:id',
        element: <AdminBrandHub />,
      },
      // A full screen rather than a dialog, ruled 2026-08-13: a contest carries
      // a dozen fields plus three lists inside it. `new` and an id share one
      // component, because creating and editing are the same form with one
      // different verb on the button.
      {
        path: '/admin/brands/:id/contests/:contestId',
        element: <AdminContestSetup />,
      },
      {
        path: '/admin/creators',
        element: <AdminCreators />,
      },
      {
        path: '/admin/creators/:id',
        element: <AdminCreatorDetail />,
      },
        ],
      },
    ],
  },
  {
    Component: () => <RequireAuth allow={['creative_strategist']} />,
    children: [
      {
        Component: ShellLayout,
        children: [
          {
            path: '/studio',
            element: <StudioHome />,
          },
        ],
      },
    ],
  },
  {
    Component: () => <RequireAuth />,
    children: [
      {
        path: '/suspended',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/Suspended'), 'Suspended'),
      },
    ],
  },

  /* --------------------------------------------------------------- 404 --- */
  {
    path: '*',
    HydrateFallback: RouteFallback,
    lazy: lazyRoute(() => import('@/routes/NotFound'), 'NotFound'),
  },
]);
