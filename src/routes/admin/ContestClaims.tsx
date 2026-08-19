import { ContestsHeader } from '@/components/admin/ContestsHeader';
import { ContestEntryQueue } from '@/components/admin/ContestEntryQueue';
import { ContestProgressQueue } from '@/components/admin/ContestProgressQueue';
import { ContestVideoQueue } from '@/components/admin/ContestVideoQueue';

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
 *
 * NO TITLE AND NO SUBTITLE, FROM 2026-08-16. The top bar names the section, and
 * the paragraph that used to sit under the header described the screen rather
 * than telling anyone how to work it, which is exactly what Rashid asked to be
 * rid of. The two things it did say worth keeping, what each queue is and why
 * somebody is stuck in it, are already written on the queues themselves, beside
 * the rows they explain.
 *
 * NO `FilterBar` EITHER, and that is a decision rather than an omission. This
 * screen has nothing to filter: it is every open claim, oldest first, and the
 * only row of controls it needs is the one `ContestsHeader` already draws. An
 * empty panel at the top would be a border around no controls.
 */
export function ContestClaims() {
  return (
    // Left aligned against the sidebar with a max width, per CLAUDE.md: the
    // shell no longer caps the content area, so the cap lives here.
    <div className="mx-0 w-full max-w-[1128px]">
      <ContestsHeader />

      {/*
        ENTRIES FIRST, and this is the screen Rashid looked at when he found
        the bug. Somebody waiting to be let in cannot claim anything yet, so
        leaving them below the progress queue would bury the thing that is
        blocking them behind the thing that is not.
      */}
      <div className="mt-3 flex flex-col gap-4">
        <ContestEntryQueue />
        <ContestProgressQueue />

        {/*
          VIDEOS LAST, because a claim is what blocks a creator and a video is
          what backs it up. But it is on this screen at all because until
          2026-08-20 a contest video could not be decided ANYWHERE: the review
          function had no caller, so every one of them read "With the team"
          for ever, and deciding a claim hid its videos for good.
        */}
        <ContestVideoQueue />
      </div>
    </div>
  );
}
