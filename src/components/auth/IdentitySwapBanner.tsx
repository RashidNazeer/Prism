import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/auth-context';

/**
 * "You are signed in as somebody else now."
 *
 * THE PROBLEM THIS SOLVES, in Rashid's words: sometimes when I am doing some
 * actions on behalf of admin it says you are not signed in, because I am logged
 * in as a creator somewhere else. Why is one profile disturbing the other?
 *
 * THE ANSWER, and it is worth writing down because it will be asked again: the
 * Supabase session lives in localStorage, which belongs to the ORIGIN, not to
 * the tab. There is one session per browser per site and there always will be.
 * Signing in as a creator in one tab therefore replaces the admin session in
 * every other tab of the same browser. Nothing in this application can prevent
 * that, and nothing should try: two sessions at once on one origin is not a
 * thing the browser offers.
 *
 * WHAT WAS ACTUALLY BROKEN was the silence. The admin screen carried on
 * rendering because it had already loaded, the next click went to an Edge
 * Function carrying somebody else's token, and it came back "Not signed in" on
 * a screen that plainly showed them signed in. That is the bug: not the swap,
 * being ambushed by it.
 *
 * SO THIS SAYS SO, LOUDLY AND IMMEDIATELY, and offers the only two things that
 * actually help: reload as whoever is signed in now, or go and be somebody else
 * in a window that has its own storage.
 *
 * IT DOES NOT RELOAD BY ITSELF. Nothing in this product reloads on an auth
 * event: that rule exists because TOKEN_REFRESHED fires roughly every hour
 * forever, and a reload from an auth handler is how somebody loses a half
 * filled form at random. The button is deliberate and it is the user's.
 */
export function IdentitySwapBanner() {
  const { identitySwap, acknowledgeSwap } = useAuth();
  if (!identitySwap) return null;

  const signedOutElsewhere = identitySwap.to === null;

  return (
    <div
      role="alert"
      // Above everything, including dialogs. A dialog is exactly where this bites:
      // half way through approving somebody, with a Save button that cannot work.
      className="border-stage-due/40 bg-stage-due-soft fixed inset-x-0 top-0 z-[100] border-b px-4 py-3 shadow-md"
    >
      <div className="mx-auto flex max-w-[1140px] flex-wrap items-center gap-x-4 gap-y-2.5">
        <AlertTriangle size={18} className="text-stage-due shrink-0" aria-hidden />

        <p className="text-stage-due min-w-0 flex-1 basis-64 text-[13px] leading-relaxed font-medium">
          {signedOutElsewhere ? (
            <>
              <span className="font-semibold">You were signed out in another tab.</span> This tab
              is still showing the old screen, and anything you do on it will be refused.
            </>
          ) : (
            <>
              <span className="font-semibold">
                You are now signed in as {identitySwap.toEmail ?? 'somebody else'}.
              </span>{' '}
              Signing in elsewhere replaces the session in every tab of this browser, so this
              screen is out of date and anything you do on it will be refused.
            </>
          )}
        </p>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={15} aria-hidden />
            Reload this tab
          </Button>
          <button
            type="button"
            onClick={acknowledgeSwap}
            aria-label="Dismiss"
            className="text-stage-due hover:bg-stage-due/10 grid size-11 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        {/*
          The only real answer to "I want to be admin here and a creator there".
          Said plainly rather than left for somebody to work out, because the
          alternative is believing the product is broken.
        */}
        <p className="text-stage-due/80 basis-full text-[12px] leading-relaxed">
          To be signed in as two people at once, use a private window or a second browser
          profile. They keep their own storage; tabs in the same window cannot.
        </p>
      </div>
    </div>
  );
}
