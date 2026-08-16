import { useSearchParams } from 'react-router';
import { ContestsHeader } from '@/components/admin/ContestsHeader';
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
 *
 * NO TITLE AND NO TAGLINE HERE SINCE 2026-08-16. The shell's top bar is the
 * page's `<h1>` and it already says "Contests"; Rashid on the paragraph that
 * used to sit under it: "i don't want to show description of that section". It
 * described the screen rather than telling anybody how to do the job, so it is
 * deleted rather than moved. The one thing in it that was load bearing, that no
 * reward is ever granted by hand, is still said inside the list, next to the
 * rows it is about.
 *
 * AND NO `FilterBar`, deliberately. The only control that changes what the list
 * shows is the Owed/Paid switch, which lives inside `ContestRewardsQueue`
 * because flipping it has to clear the selection and the page with it. Row one
 * of this screen is the sections row `ContestsHeader` draws.
 */
export function ContestRewards() {
  const [params, setParams] = useSearchParams();

  // Owed is the default because it is the JOB. Paid is the record, one click
  // across, which is the habit Rashid has now asked for twice.
  const view: RewardsView = params.get('view') === 'paid' ? 'paid' : 'owed';

  // Full width, no cap: the shell stopped capping content on 2026-08-16 and a
  // cap left behind here would reopen the dead gap that change closed.
  return (
    <div className="flex w-full flex-col gap-4">
      <ContestsHeader />

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
  );
}
