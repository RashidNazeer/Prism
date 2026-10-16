import { useEffect, useRef, useState } from 'react';
import type { CreatorContest } from '@/lib/creator/useCreatorContests';

/**
 * CONFETTI FIRES FOR A REAL WIN, AND NOTHING ELSE. §2.
 *
 * A real win here is a CONTEST AWARD: a `contest_awards` row, which is only
 * ever written when a member of staff confirms a figure that crosses a target.
 * It is money she has actually earned, checked by a person, and it is the one
 * thing on this screen worth interrupting her for.
 *
 * WHAT IS DELIBERATELY NOT A WIN: entering a contest (nothing has been earned),
 * filing a claim (it is a sentence somebody typed, and money is owed against a
 * CONFIRMED figure and nothing else), a deliverable bar filling up (same
 * reason), or the screen simply loading with awards already on it. Celebrating
 * a claim would be the product congratulating her for a number we have not
 * checked, which is the exact confusion the claimed/confirmed split exists to
 * prevent.
 *
 * IT NEVER FIRES ON FIRST PAINT. `seen` starts as null and is only compared
 * once a real count has been through it, so arriving on the screen with nine
 * awards is quiet and the tenth landing while she is looking is not.
 *
 * REDUCED MOTION IS HANDLED BY `Confetti` ITSELF, which renders nothing at all
 * in that case — letting the global "no animations" rule apply instead would
 * freeze forty coloured squares across the middle of the screen, which is worse
 * than no confetti.
 */
export function useContestWin(contests: CreatorContest[]): boolean {
  const [firing, setFiring] = useState(false);
  const seen = useRef<number | null>(null);

  let awards = 0;
  for (const c of contests) awards += c.awards.length;

  useEffect(() => {
    const previous = seen.current;
    seen.current = awards;
    if (previous === null || awards <= previous) return;
    setFiring(true);
    /* Long enough for the slowest piece (delay 0.9s + duration 4.5s) to leave
       the bottom of the viewport, then the layer unmounts. A fixed overlay left
       mounted is an invisible lid over the page. */
    const t = setTimeout(() => setFiring(false), 5_600);
    return () => clearTimeout(t);
  }, [awards]);

  return firing;
}
