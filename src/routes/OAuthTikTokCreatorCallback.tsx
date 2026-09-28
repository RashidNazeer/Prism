import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { useTikTokFinish } from '@/lib/creator/useTikTokAccount';

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
    const stash = (window as unknown as { __wxOAuthReturn?: Record<string, string | null> }).__wxOAuthReturn;
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
      setMessage('That link is missing something. Start again from your profile.');
      return;
    }

    finish
      .mutateAsync({ code, state })
      .then((r) => {
        setHandle(r.displayName);
        setPhase('done');
        // Straight back to where they started, once they have read it.
        setTimeout(() => navigate('/app/profile', { replace: true }), 1600);
      })
      .catch((e: Error) => {
        setPhase('failed');
        setMessage(e.message);
      });
    // Once. See the guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-bg text-text flex min-h-dvh items-center justify-center p-6">
      <div className="border-line bg-surface-1 w-full max-w-md rounded-xl border p-8 text-center shadow-md">
        <WurxMark className="mx-auto h-6 w-auto" />

        {phase === 'working' ? (
          <>
            <Loader2 size={26} aria-hidden className="text-accent mx-auto mt-6 animate-spin" />
            <p className="mt-4 font-semibold">Linking your TikTok account</p>
            <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">
              One moment. Do not close this window.
            </p>
          </>
        ) : phase === 'done' ? (
          <>
            <CheckCircle2 size={26} aria-hidden className="text-success mx-auto mt-6" />
            <p className="mt-4 font-semibold">
              {handle ? `Connected as ${handle}` : 'TikTok connected'}
            </p>
            <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">
              Taking you back to your profile.
            </p>
          </>
        ) : (
          <>
            <XCircle size={26} aria-hidden className="text-danger mx-auto mt-6" />
            <p className="mt-4 font-semibold">That did not work</p>
            <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">{message}</p>
            <Link
              to="/app/profile"
              className="border-line hover:border-accent hover:text-accent mt-6 inline-flex rounded-md border px-4 py-2 text-[0.875rem] font-semibold transition-colors"
            >
              Back to your profile
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
