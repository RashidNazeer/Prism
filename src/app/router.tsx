import { createBrowserRouter } from 'react-router';
import { RouteFallback } from '@/components/layout/RouteFallback';

/**
 * Route table.
 *
 * Every route is lazy so each screen ships as its own chunk, a creator opening
 * the landing page should not download the admin dashboard. `HydrateFallback`
 * renders the skeleton while a chunk is in flight (never a bare spinner).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    HydrateFallback: RouteFallback,
    lazy: async () => {
      const { Landing } = await import('@/routes/Landing');
      return { Component: Landing };
    },
  },
  {
    path: '/apply',
    HydrateFallback: RouteFallback,
    lazy: async () => {
      const { Apply } = await import('@/routes/Apply');
      return { Component: Apply };
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
