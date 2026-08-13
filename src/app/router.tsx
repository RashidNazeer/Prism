import { createBrowserRouter } from 'react-router';
import { RouteFallback } from '@/components/layout/RouteFallback';
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

export const router = createBrowserRouter([
  /* ------------------------------------------------------------- public -- */
  {
    path: '/',
    HydrateFallback: RouteFallback,
    lazy: lazyRoute(() => import('@/routes/Landing'), 'Landing'),
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
  {
    Component: () => <RequireAuth allow={['applicant', 'creator']} />,
    children: [
      {
        path: '/app',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/app/Dashboard'), 'Dashboard'),
      },
      {
        path: '/app/profile',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/app/Profile'), 'Profile'),
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
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/app/Brands'), 'Brands'),
      },
      {
        path: '/app/brands/:slug',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/app/BrandHub'), 'BrandHub'),
      },
      {
        path: '/app/offers',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/app/Offers'), 'Offers'),
      },
      // Contests get their own place in the menu on BOTH sides, the same way
      // offers do. Reaching them only by walking into a brand first was the
      // wrong shape and Rashid caught it.
      {
        path: '/app/contests',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/app/Contests'), 'Contests'),
      },
      {
        path: '/app/content',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/app/Content'), 'Content'),
      },
    ],
  },
  {
    Component: () => <RequireAuth allow={['ops', 'admin']} />,
    children: [
      {
        path: '/admin',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/AdminDashboard'), 'AdminDashboard'),
      },
      {
        path: '/admin/applications',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/Applications'), 'Applications'),
      },
      {
        path: '/admin/applications/:id',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/ApplicationDetail'), 'ApplicationDetail'),
      },
      // Offers is a section with two screens: the catalogue of everything we
      // run, and the queue of creators waiting on a decision. They answer
      // different questions and are worked at different times.
      {
        path: '/admin/offers',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/AllOffers'), 'AllOffers'),
      },
      {
        path: '/admin/offers/requests',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/OfferRequests'), 'OfferRequests'),
      },
      {
        path: '/admin/contests',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/AllContests'), 'AllContests'),
      },
      {
        path: '/admin/content',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/Content'), 'AdminContent'),
      },
      {
        path: '/admin/activity',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/Activity'), 'Activity'),
      },
      {
        path: '/admin/brands',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/Brands'), 'Brands'),
      },
      {
        path: '/admin/brands/:id',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/BrandHub'), 'BrandHub'),
      },
      // A full screen rather than a dialog, ruled 2026-08-13: a contest carries
      // a dozen fields plus three lists inside it. `new` and an id share one
      // component, because creating and editing are the same form with one
      // different verb on the button.
      {
        path: '/admin/brands/:id/contests/:contestId',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/ContestSetup'), 'ContestSetup'),
      },
      {
        path: '/admin/creators',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/Creators'), 'Creators'),
      },
      {
        path: '/admin/creators/:id',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/CreatorDetail'), 'CreatorDetail'),
      },
    ],
  },
  {
    Component: () => <RequireAuth allow={['creative_strategist']} />,
    children: [
      {
        path: '/studio',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/studio/StudioHome'), 'StudioHome'),
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
