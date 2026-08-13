import { useSearchParams } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import {
  ContestRewardsQueue,
  type RewardsView,
} from '@/components/admin/ContestRewardsQueue';

/**
 * What we owe creators, across every contest, and what we have already paid.
 *
 * THE THIRD SCREEN IN THE CONTESTS GROUP, and the three are three different
 * jobs: `/admin/contests` is what is running, `/admin/contests/claims` is who is
 * waiting on us, and this is what it has cost. Rashid, 2026-08-13: an admin
 * should not have to go into a brand and then into a contest to find the work.
 *
 * A REWARD IS OWED THE MOMENT STAFF CONFIRM THE FIGURE THAT EARNS IT, decided
 * on 2026-08-14. So this screen never decides whether somebody earned anything;
 * the claims queue did that. It is about money that is already owed, and the
 * only decision on it is "this has been sent".
 *
 * The view lives in the URL, so an admin working through the owed list can send
 * somebody the link they are looking at, the same as every other filter in the
 * admin panel.
 */
export function ContestRewards() {
  const [params, setParams] = useSearchParams();

  // Owed is the default because it is the JOB. Paid is the record, one click
  // across, which is the habit Rashid has now asked for twice.
  const view: RewardsView = params.get('view') === 'paid' ? 'paid' : 'owed';

  return (
    <AppShell>
      <div className="mx-0 w-full max-w-[1128px]">
        <div className="pb-5">
          <h1 className="font-display text-text text-[26px] leading-tight font-bold">
            Contest rewards
          </h1>
          <p className="text-muted mt-1 max-w-prose text-[14px] leading-relaxed">
            What creators have earned by crossing a target on figures this team confirmed. Nothing
            here was granted by hand: a reward becomes owed at the moment a claim is confirmed, and
            the only thing left to do with it is pay it.
          </p>
        </div>

        <ContestRewardsQueue
          view={view}
          onViewChange={(next) => {
            const nextParams = new URLSearchParams(params);
            if (next === 'owed') nextParams.delete('view');
            else nextParams.set('view', next);
            setParams(nextParams, { replace: true });
          }}
        />
      </div>
    </AppShell>
  );
}
