import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth, HOME_FOR_ROLE, type AppRole } from '@/lib/auth/auth-context';
import { RouteFallback } from '@/components/layout/RouteFallback';

/**
 * Route guard.
 *
 * All redirect decisions live here rather than in the auth listener, so a
 * routine token refresh can never bounce someone out of what they were doing.
 * This only reacts to state.
 *
 * `allow` is about SHOWING the right screen, not about security. Someone who
 * edits their token to say "admin" gets an admin-looking page full of nothing,
 * because every query underneath is still refused by row level security.
 */
export function RequireAuth({ allow }: { allow?: readonly AppRole[] }) {
  const { status, claims } = useAuth();
  const location = useLocation();

  // Still reading the stored session. Showing the sign-in page here would make
  // every reload flash "signed out" before settling.
  if (status === 'loading') return <RouteFallback />;

  if (status === 'signedOut') {
    return (
      <Navigate
        to="/login"
        replace
        // Remember where they were going so sign-in can send them back.
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // Suspended accounts keep their session but lose access to everything.
  if (claims && !claims.active) return <Navigate to="/suspended" replace />;

  if (allow && claims && !allow.includes(claims.role)) {
    return <Navigate to={HOME_FOR_ROLE[claims.role]} replace />;
  }

  return <Outlet />;
}

/** The mirror image: keep signed-in people off the sign-in and sign-up pages. */
export function RedirectIfSignedIn() {
  const { status, claims } = useAuth();
  if (status === 'loading') return <RouteFallback />;
  if (status === 'signedIn' && claims) {
    return <Navigate to={HOME_FOR_ROLE[claims.role]} replace />;
  }
  return <Outlet />;
}
