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

  /* ------------------------------------------ signed out only (auth) ----- */
  {
    Component: RedirectIfSignedIn,
    children: [
      {
        path: '/login',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/auth/SignIn'), 'SignIn'),
      },
      // /signup is the application form. Applying IS signing up, so there is no
      // separate "create an account" screen that collects less information.
      {
        path: '/signup',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/Apply'), 'Apply'),
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
    ],
  },
  {
    Component: () => <RequireAuth allow={['ops', 'admin']} />,
    children: [
      {
        path: '/admin',
        HydrateFallback: RouteFallback,
        lazy: lazyRoute(() => import('@/routes/admin/AdminHome'), 'AdminHome'),
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
