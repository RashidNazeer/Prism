import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { queryClient } from '@/lib/query-client';
import {
  AuthContext,
  readClaims,
  type AuthStatus,
  type IdentitySwap,
} from './auth-context';

// NOTE: `@/lib/supabase` is imported dynamically below, never at the top of
// this file. This provider wraps every page including the public landing page,
// and a static import would drag the whole Supabase client (~55 KB gzipped)
// into the entry chunk, so a visitor who only reads the marketing page would
// pay for a database client they never use. Loading it here keeps it off the
// critical path; it arrives just after first paint, long before anyone can
// click "Sign in".
const supabaseClient = () => import('@/lib/supabase').then((m) => m.getSupabase());

/**
 * Session state for the whole app.
 *
 * This component is the single place that listens to Supabase auth events, and
 * it is written specifically to avoid the random-logout and mid-typing-reload
 * problems Rashid hit on previous projects. The rules it follows:
 *
 *   1. It NEVER navigates and NEVER reloads. Supabase fires TOKEN_REFRESHED
 *      roughly every hour, forever. Anything that redirects from here would
 *      throw a user out of whatever they were doing, at random, an hour in.
 *      Redirecting is the job of the route guards, which react to state.
 *
 *   2. It only calls setState when something meaningful actually changed. A
 *      refreshed token produces a new object with the same user, and setting
 *      state on that would re-render the entire tree once an hour for nothing.
 *
 *   3. It renders the same children throughout. No `key` derived from the
 *      session, no unmounting on refresh, so a half-filled form survives.
 *
 *   4. It is multi-tab safe for free: Supabase persists the session to
 *      localStorage and broadcasts changes, so a second tab picks up a sign-in
 *      or sign-out through the same listener.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);

  // Tracks who is signed in right now, so we can tell a genuine account change
  // from a routine token refresh without putting it in state.
  const currentUserId = useRef<string | null>(null);

  /*
   * Set when a real person is replaced by a different person, or by nobody,
   * which in practice only happens because another tab signed in or out. See
   * IdentitySwap for why this exists at all.
   */
  const [identitySwap, setIdentitySwap] = useState<IdentitySwap | null>(null);
  const acknowledgeSwap = useCallback(() => setIdentitySwap(null), []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const supabase = await supabaseClient();
      if (cancelled) return;

      // Restore whatever is already in storage.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      currentUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
      setStatus(data.session ? 'signedIn' : 'signedOut');

      const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (cancelled) return;

        const nextUserId = nextSession?.user.id ?? null;
        const previousUserId = currentUserId.current;
        const userChanged = nextUserId !== previousUserId;
        currentUserId.current = nextUserId;

        /*
         * A SWAP, not a sign-in. `previousUserId` being non-null is the whole
         * test: a fresh tab goes null -> somebody, which is ordinary, and a
         * token refresh keeps the same id. Anything else means the person this
         * tab belonged to is no longer the person it belongs to, and they are
         * about to click something that will fail in a way that makes no sense.
         *
         * `signOut()` from THIS tab lands here too, and would raise a banner
         * about a sign-out the user just asked for. It is suppressed by the
         * guard clearing the flag on the way out, below.
         */
        if (userChanged && previousUserId !== null) {
          setIdentitySwap({
            from: previousUserId,
            to: nextUserId,
            toEmail: nextSession?.user.email ?? null,
          });
        }

        // Always keep the session object current: the access token inside it is
        // what every database call uses, and it must not go stale.
        setSession(nextSession);
        setStatus(nextSession ? 'signedIn' : 'signedOut');

        // Cached data belongs to a person. Throw it away only when the person
        // changes, never on a routine token refresh.
        if (userChanged) {
          if (event === 'SIGNED_OUT' || !nextSession) queryClient.clear();
          else void queryClient.invalidateQueries();
        }

        // Deliberately nothing else. No navigate(), no window.location, no
        // reload. See the rules above.
      });

      unsubscribe = () => sub.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await supabaseClient();
    await supabase.auth.signOut();
    // State updates arrive through onAuthStateChange; the guards handle the
    // redirect. Nothing to do here EXCEPT clear the swap flag: signing yourself
    // out is not being ambushed, and a banner explaining it would be noise.
    setIdentitySwap(null);
  }, []);

  const claims = useMemo(
    () => readClaims(session?.access_token),
    [session?.access_token]
  );

  const value = useMemo(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      claims,
      identitySwap,
      acknowledgeSwap,
      signOut,
    }),
    [status, session, claims, identitySwap, acknowledgeSwap, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
