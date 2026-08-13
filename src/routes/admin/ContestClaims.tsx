import { AppShell } from '@/components/layout/AppShell';
import { ContestProgressQueue } from '@/components/admin/ContestProgressQueue';

/**
 * Every claim waiting on the team, across every contest.
 *
 * The twin of /admin/offers/requests, and split from /admin/contests for the
 * same reason offers are split: "what is running" and "who is waiting on me"
 * are different questions, worked at different times of day, and a screen that
 * tries to answer both answers neither well.
 *
 * The same queue component runs inside one contest on the setup screen. Here it
 * runs with no contest, which is what an admin sitting down to clear a backlog
 * actually wants.
 *
 * WHY THIS SCREEN MATTERS MORE THAN IT LOOKS: a creator types their own GMV, so
 * nothing they claim counts until somebody here confirms it. A claim sitting
 * unread is a creator watching a figure that will not move, and believing the
 * product is broken.
 */
export function ContestClaims() {
  return (
    <AppShell>
      <div className="mx-0 w-full max-w-[1128px]">
        <div className="pb-5">
          <h1 className="font-display text-text text-[26px] leading-tight font-bold">
            Contest claims
          </h1>
          <p className="text-muted mt-1 max-w-prose text-[14px] leading-relaxed">
            What creators say they have achieved, waiting to be confirmed. Nothing counts towards a
            reward, and nothing is owed, until you confirm it here.
          </p>
        </div>

        <ContestProgressQueue />
      </div>
    </AppShell>
  );
}
