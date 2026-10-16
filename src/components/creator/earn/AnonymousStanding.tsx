import { useMyContestStanding } from '@/lib/creator/useCreatorContests';
import { cn } from '@/lib/utils';

/**
 * "You are #4 of 11." THAT SENTENCE, AND NOTHING ELSE.
 *
 * THE CONTEST STANDING IS ANONYMOUS, AND THAT IS DELIBERATE. Decision D7, with
 * the amendment Rashid made on 2026-08-13: a creator may be told how many
 * people are in it and where they themselves sit, and NOTHING about anybody
 * else. No handle, no name, no identifier, no other entrant's figure. This is
 * the exact width of that amendment, and nothing may ever be added to it.
 *
 * It differs on purpose from `/app/leaderboards`, which shows names. That
 * screen never made this promise; this one did.
 *
 * IT TAKES NO USER ID. `my_contest_standing` reads `auth.uid()` itself, ranks
 * the whole field inside a security definer function and then filters to the
 * caller's own row, so there is no argument a curious person could change into
 * somebody else — and ranking only the rows this browser can read would answer
 * "#1 of 1" with no error at all.
 *
 * ITS OWN COMPONENT SO THE QUERY IS ITS OWN COMPONENT. `useMyContestStanding`
 * is keyed per contest, so mounting it on every tile in the list would open one
 * query per contest on screen. This is rendered only for a contest she actually
 * holds an approved entry in, which is two or three of them rather than fifteen.
 *
 * NOTHING IS DRAWN WHEN THERE IS NOTHING TO SAY: no approved entry returns no
 * rows, and a field of one has no standing worth the words.
 */
export function AnonymousStanding({
  contestId,
  className,
}: {
  contestId: string;
  className?: string;
}) {
  const { data: standing } = useMyContestStanding(contestId);

  if (!standing || standing.entrants <= 1) return null;

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1', className)}>
      <p className="text-[0.8125rem]">
        <span className="text-muted">On GMV </span>
        <span className="text-text font-display wx-numeric font-bold">
          You are #{standing.gmvPlace}
        </span>
        <span className="text-muted"> of {standing.entrants}</span>
      </p>
      <p className="text-[0.8125rem]">
        <span className="text-muted">On videos </span>
        <span className="text-text font-display wx-numeric font-bold">
          #{standing.videoPlace}
        </span>
      </p>
      {/*
        The promise, in words, for somebody reading rather than glancing. It is
        literally true: there is no column here that names anybody, and
        `set_contest_entry_target` writes no audit row for the same reason.
      */}
      <p className="text-faint basis-full text-[0.6875rem] leading-snug">
        Ranked on confirmed figures only, so it moves when the team confirms a claim. Nobody can
        see who anybody else is, and neither can you.
      </p>
    </div>
  );
}
