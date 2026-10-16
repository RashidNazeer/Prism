import { RingProgress } from '@/components/charts';
import type { Countdown } from './contest-math';

/**
 * TIME LEFT AS A SHARE OF THE CONTEST'S OWN LENGTH. §8.1.
 *
 * `RingProgress` from the one chart family, so this ring obeys the same rules
 * about `rem`, tokens and missing data as every other graph in the app. The
 * ring EMPTIES as the deadline comes: a full ring is "the whole window is still
 * ahead of you".
 *
 * UNDER 48 HOURS IT USES THE WARNING TOKEN, and never colour alone — the centre
 * switches from counting days to counting hours at the same moment, so the
 * urgency is in the words as well as the hue.
 *
 * A NULL SHARE IS NOT A 0% RING. A contest whose window has no length (a bad
 * `opens_at`/`expires_at` pair) has no fraction to draw, and `RingProgress`
 * answers a null by drawing the track dashed and saying "Not reported" rather
 * than by drawing an empty ring, which would read as "no time left".
 */
export function CountdownRing({
  countdown,
  ariaLabel,
  size = '4.75rem',
}: {
  countdown: Countdown;
  /** What the ring says, in words, for a screen reader. */
  ariaLabel: string;
  size?: string;
}) {
  return (
    <RingProgress
      value={countdown.share}
      centre={countdown.centre}
      sub={countdown.sub}
      /* `--wx-warning` and `--chart-2` are both declared in both themes in
         `src/styles/tokens.css`, so the ring recolours on a theme switch with
         no reload and nothing here hard-codes a hex. */
      token={countdown.urgent ? '--wx-warning' : '--chart-2'}
      ariaLabel={ariaLabel}
      size={size}
    />
  );
}
