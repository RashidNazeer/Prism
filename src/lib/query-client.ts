import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client.
 *
 * Defaults are tuned for the behaviour we want at 50k+ users: switching tabs or
 * navigating back to a screen shows cached data instantly and refreshes quietly
 * in the background, rather than firing a fresh request (and a loading spinner)
 * on every single click.
 *
 * Individual queries override `staleTime` where the data justifies it, e.g.
 * TikTok analytics only change once a day, so they can be stale for far longer
 * than an application-status row that must feel live.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min: don't refetch on every remount
      gcTime: 15 * 60_000, // keep unused data 15 min so back-navigation is instant
      refetchOnWindowFocus: false, // focus should not hammer the database
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // Never retry auth/permission failures, they will not fix themselves.
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});
