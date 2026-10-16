import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { WelcomeMoment } from '@/components/creator/WelcomeMoment';
import { ApprovedMoment } from '@/components/creator/ApprovedMoment';
import { CreatorHome } from '@/components/creator/home/CreatorHome';
import { ApplicantHome } from '@/components/creator/home/ApplicantHome';
import { HomeSkeleton } from '@/components/creator/home/HomeSkeleton';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useApplication } from '@/lib/auth/useApplication';
import { useOnboarding } from '@/lib/creator/useOnboarding';
import { useTikTokAccount } from '@/lib/creator/useTikTokAccount';

/**
 * HOME, WHICH IS NOW ONLY A SWITCH.
 *
 * This file used to be 1,344 lines doing three jobs at once — onboarding, the
 * application's status, and a dashboard of work in flight — all interleaved in
 * one component. The brief's phrase for it was "three screens in a trench
 * coat". They are three screens, so they are three components now, and this
 * one decides which of them is true for the person looking.
 *
 * The split is BY STATE, not by tab:
 *   - still applying        -> `ApplicantHome`, the building with rooms locked
 *   - approved a moment ago -> `ApprovedMoment` once, then the creator Home
 *   - working creator       -> `CreatorHome`, the money dashboard
 *
 * The welcome and approval moments stay overlays, as they already were, which
 * is what §5 means by the onboarding overlay being "a one time bottom sheet,
 * not part of the page".
 */
export function Dashboard() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const { data: application, isLoading: appLoading } = useApplication();
  const { moment, dismiss, dismissing } = useOnboarding();
  const { data: tiktok } = useTikTokAccount();

  /* Prefer the profile row over the JWT claim. A token only refreshes about
     once an hour, so somebody approved thirty seconds ago still carries
     `applicant` in their claims. */
  const role = profile?.role ?? claims?.role;
  const firstName = (profile?.display_name || profile?.email?.split('@')[0] || '').split(' ')[0];

  return (
    <>
      {moment === 'welcome' && (
        <WelcomeMoment name={firstName ?? ''} busy={dismissing} onDone={() => dismiss('welcome')} />
      )}

      {moment === 'approved' && (
        <ApprovedMoment
          name={firstName ?? ''}
          tier={profile?.tier ?? null}
          note={application?.review_note ?? null}
          busy={dismissing}
          onDone={() => dismiss('approved')}
        />
      )}

      {appLoading ? (
        <HomeSkeleton />
      ) : role === 'creator' ? (
        <CreatorHome name={firstName ?? ''} tier={profile?.tier ?? null} />
      ) : application ? (
        <ApplicantHome
          name={firstName ?? ''}
          application={application}
          tiktokConnected={Boolean(tiktok?.connected_at && !tiktok.revoked_at)}
        />
      ) : (
        <Unfinished />
      )}
    </>
  );
}

/**
 * Signed in, but the application was never finished.
 *
 * Kept deliberately short. Somebody in this state does not need a tour; they
 * need the one link that moves them forward.
 */
function Unfinished() {
  return (
    <section className="wx-neo-raised rounded-xl p-6">
      <h1 className="text-text text-lg font-semibold">Your application is not finished</h1>
      <p className="text-muted mt-2 max-w-prose text-sm">
        You have an account, but we never received a finished application, so there is nothing
        for us to review yet.
      </p>
      <Link
        to="/apply"
        className="bg-accent text-on-accent mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 text-sm font-semibold"
      >
        Finish applying
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
