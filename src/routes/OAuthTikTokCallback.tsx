import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { PrismMark } from '@/components/brand/PrismMark';
import { finishTikTokConnect } from '@/lib/tiktok';

/**
 * Where TikTok sends the admin back after they authorise us.
 *
 * PUBLIC ON PURPOSE. Whoever lands here has just come from tiktok.com and may
 * have no hub session in this tab, so requiring one would fail the flow at the
 * final step for reasons that look random. The single-use `state` nonce, minted
 * by an admin-only edge function and burned server side, is what makes that
 * safe. See the header of `supabase/functions/tiktok-callback/index.ts`.
 *
 * THIS PAGE IS DELIBERATELY STUPID. It reads two values out of the URL, hands
 * them to the function, and reports what came back. It holds no credential,
 * makes no decision, and knows nothing about the app secret.
 *
 * IT RUNS EXACTLY ONCE. React 18 and 19 mount effects twice in development, and
 * the nonce is single use, so without the guard the second run would burn a
 * nonce the first run had already spent and report a real success as a failure.
 */
export function OAuthTikTokCallback() {
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ accounts: number; stores: number } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    /* Taken off the address before the Supabase client loaded â€” see the script
       in index.html. That client is `detectSessionInUrl: true` with PKCE and
       would otherwise try to spend TikTok's `code` as its own. */
    const stash = (window as unknown as { __wxOAuthReturn?: Record<string, string | null> })
      .__wxOAuthReturn;
    const params = new URLSearchParams(window.location.search);
    const authCode = stash?.code ?? params.get('auth_code') ?? params.get('code');
    const nonce = stash?.state ?? params.get('state');

    /*
     * STRIP THE CODE FROM THE ADDRESS BAR IMMEDIATELY.
     *
     * It arrives as ?auth_code=... which otherwise sits in browser history, in
     * the referrer of anything this page loads, and in any screenshot of the
     * window. It is single use and about to be spent, but it costs one line to
     * not leave it lying around.
     */
    window.history.replaceState({}, '', window.location.pathname);

    if (!authCode || !nonce) {
      setState('failed');
      setMessage(
        'TikTok did not send back what we needed. Start again from the TikTok screen in the admin panel.'
      );
      return;
    }

    finishTikTokConnect(authCode, nonce)
      .then((res) => {
        setState('done');
        setSummary({ accounts: res.accounts, stores: res.stores });
        if (res.warning) setMessage(res.warning);
      })
      .catch((e: Error) => {
        setState('failed');
        setMessage(e.message);
      });
  }, []);

  return (
    <main className="bg-bg grid min-h-dvh place-items-center px-6 py-12">
      <div className="wx-neo-raised w-full max-w-md rounded-xl p-8 text-center">
        <PrismMark height={26} className="mx-auto" />

        {state === 'working' ? (
          <>
            <Loader2 size={30} aria-hidden className="text-accent mx-auto mt-7 animate-spin" />
            <h1 className="font-display mt-5 text-[1.25rem] font-bold">Connecting TikTok</h1>
            <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">
              Swapping the code TikTok gave us for an access token. This takes a moment.
            </p>
          </>
        ) : state === 'done' ? (
          <>
            <CheckCircle2 size={30} aria-hidden className="text-success mx-auto mt-7" />
            <h1 className="font-display mt-5 text-[1.25rem] font-bold">TikTok is connected</h1>
            <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">
              {summary
                ? `We can see ${summary.accounts} ad ${
                    summary.accounts === 1 ? 'account' : 'accounts'
                  } and ${summary.stores} ${summary.stores === 1 ? 'store' : 'stores'}.`
                : 'The connection is saved.'}
            </p>
            {message ? (
              <p className="text-warning mt-4 rounded-md p-3 text-[0.8125rem] leading-relaxed">
                One thing did not finish: {message} Press Re-check on the TikTok screen.
              </p>
            ) : null}
            <Link
              to="/admin/tiktok"
              className="wx-gradient text-on-accent ease-brand mt-6 inline-flex min-h-[44px] items-center rounded-md px-5 text-[0.875rem] font-semibold transition-all duration-200"
            >
              Map the accounts to brands
            </Link>
          </>
        ) : (
          <>
            <XCircle size={30} aria-hidden className="text-danger mx-auto mt-7" />
            <h1 className="font-display mt-5 text-[1.25rem] font-bold">That did not connect</h1>
            <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">{message}</p>
            <Link
              to="/admin/tiktok"
              className="wx-neo-raised-sm wx-neo-press hover:bg-surface-2 ease-brand mt-6 inline-flex min-h-[44px] items-center rounded-md px-5 text-[0.875rem] font-semibold transition-colors duration-200"
            >
              Back to the TikTok screen
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
