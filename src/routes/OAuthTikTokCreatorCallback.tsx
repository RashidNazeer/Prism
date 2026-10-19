import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { ButtonLink } from '@/components/ui/Button';
import { getSupabase } from '@/lib/supabase';
import { useTikTokFinish } from '@/lib/creator/useTikTokAccount';
import { finishTikTokSignup, signupInFlight } from '@/lib/signup/tiktokSignup';

/**
 * Where TikTok sends a CREATOR back after they connect their own account.
 *
 * A separate page from `/oauth/tiktok/callback`, which is the ADMIN's ads
 * connection. Different app, different platform, different flow, and mixing
 * them would mean one page guessing which of two handshakes it is finishing.
 *
 * PUBLIC ON PURPOSE, for the same reason as its sibling: whoever lands here has
 * just come from tiktok.com and may have no session in this tab. A creator who
 * approved inside TikTok's in-app browser on a phone is exactly the person this
 * is built for, and demanding a cookie would fail them at the last step. The
 * single-use `state` nonce is what makes it safe, and it is checked and burned
 * server side.
 *
 * IT RUNS EXACTLY ONCE. React mounts effects twice in development and the nonce
 * is single use, so without the guard the second run would spend a nonce the
 * first had already burned and report a real success as a failure.
 */
export function OAuthTikTokCreatorCallback() {
  const [phase, setPhase] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const started = useRef(false);
  const finish = useTikTokFinish();
  const navigate = useNavigate();

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    /*
     * THE PARAMETERS HAVE USUALLY ALREADY BEEN TAKEN OFF THE ADDRESS, by the
     * script in index.html that runs before the Supabase client is built.
     * That is not tidiness: the client is `detectSessionInUrl: true` with PKCE,
     * so a `?code=` sitting in the address when it loads is one it will try to
     * spend as its own. Reading them from there is the normal path; the query
     * string is only a fallback for a page that somehow loaded without it.
     */
    const stash = (window as unknown as { __wxOAuthReturn?: Record<string, string | null> })
      .__wxOAuthReturn;
    const params = new URLSearchParams(window.location.search);
    const code = stash?.code ?? params.get('code');
    const state = stash?.state ?? params.get('state');
    const denied = stash?.error ?? params.get('error');

    /*
     * STRIP THE CODE FROM THE ADDRESS BAR IMMEDIATELY, if anything is left. It
     * otherwise sits in browser history, in the referrer of anything this page
     * loads, and in any screenshot of the window.
     */
    window.history.replaceState({}, '', window.location.pathname);

    /* Saying no is a normal answer, not an error. */
    if (denied) {
      setPhase('failed');
      setMessage('You did not approve the connection, so nothing was linked.');
      return;
    }

    if (!code || !state) {
      setPhase('failed');
      setMessage('That link is incomplete.');
      return;
    }

    /*
     * IS THIS A SIGN-UP OR A SETTINGS CONNECT?
     *
     * Both come back to this address, because a second redirect URI has to be
     * registered on the TikTok app before signup can have its own. The browser
     * that started a signup left a marker in its own sessionStorage, so the
     * question is answered here without a round trip and without the server
     * telling a stranger which states exist.
     *
     * If the marker is missing â€” TikTok's in-app browser handing the return to
     * a different browser â€” this falls through to the creator flow and refuses
     * there. Safe: it can end in "start again", never in the wrong identity.
     */
    if (signupInFlight()) {
      finishTikTokSignup(code, state)
        .then((identity) => {
          setHandle(identity.handle ? `@${identity.handle}` : identity.displayName);
          setPhase('done');
          setTimeout(() => navigate('/signup', { replace: true }), 1400);
        })
        .catch((e: Error) => {
          setPhase('failed');
          setMessage(e.message);
        });
      return;
    }

    finish
      .mutateAsync({ code, state })
      .then((r) => {
        setHandle(r.displayName);
        setPhase('done');
        // Straight back to where they started, once they have read it.
        setTimeout(() => navigate('/app', { replace: true }), 1600);
      })
      .catch(async (e: Error) => {
        /* Nobody signed in AND no sign-up marker in this browser: the return
           belongs to a sign-up begun in another window, browser or address
           (sessionStorage is per address). The creator flow's "link used or
           expired" is true but useless there. */
        const { data } = await getSupabase().auth.getSession();
        setPhase('failed');
        setMessage(
          data.session
            ? e.message
            : 'This connection was started in a different browser or window. Open the sign-up page again here and press Continue with TikTok.'
        );
      });
    // Once. See the guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failed = phase === 'failed';
  return (
    <AuthShell
      title={
        phase === 'working'
          ? 'Linking your TikTok account'
          : phase === 'done'
            ? handle
              ? `Connected as ${handle}`
              : 'TikTok connected'
            : 'That did not work'
      }
      subtitle={failed ? message : undefined}
    >
      <div className="flex flex-col items-center gap-4">
        {phase === 'working' ? (
          <Loader2 size={28} aria-hidden className="text-accent animate-spin" />
        ) : phase === 'done' ? (
          <CheckCircle2 size={28} aria-hidden className="text-success" />
        ) : (
          <>
            <XCircle size={28} aria-hidden className="text-danger" />
            <ButtonLink to={signupInFlight() ? '/signup' : '/app'} size="lg" className="w-full">
              Back to Prism
            </ButtonLink>
          </>
        )}
      </div>
    </AuthShell>
  );
}
