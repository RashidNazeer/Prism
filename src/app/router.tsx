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
const lazyRoute = (load: () => Promise<Record<string, unknown>>, name: string) => async () => {
  const mod = await load();
  return { Component: mod[name] as React.ComponentType };
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
        lazy: lazyRoute(
          () => import('@/routes/admin/ApplicationDetail'),
          'ApplicationDetail'
        ),
      },
      {
        path: '/admin/offers',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/OfferRequests'), 'OfferRequests'),
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
