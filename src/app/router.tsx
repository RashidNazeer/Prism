import { createBrowserRouter } from 'react-router';
import { RouteFallback } from '@/components/layout/RouteFallback';

/**
 * Route table.
 *
 * Every route is lazy so each screen ships as its own chunk — a creator opening
 * the landing page should not download the admin dashboard. `HydrateFallback`
 * renders the skeleton while a chunk is in flight (never a bare spinner).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    HydrateFallback: RouteFallback,
    lazy: async () => {
      const { ComingSoon } = await import('@/routes/ComingSoon');
      return { Component: ComingSoon };
    },
  },
  {
    path: '*',
    HydrateFallback: RouteFallback,
    lazy: async () => {
      const { NotFound } = await import('@/routes/NotFound');
      return { Component: NotFound };
    },
  },
]);
