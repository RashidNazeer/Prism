import { m, useReducedMotion } from 'motion/react';
import { CreatorFace } from '@/components/work/CreatorFace';
import { cn } from '@/lib/utils';
import type { LeaderboardRow } from '@/lib/creator/useLeaderboard';
import { faceMoney, tipMoney, videosLabel } from './board-kit';

/**
 * THE TOP THREE, first in the middle and raised.
 *
 * NO GOLD, SILVER OR BRONZE. §7.2 asks for the accent token at three
 * strengths, and that is what the pedestal rail and the rank pill carry:
 * `--wx-accent` at full, `--wx-accent-ring` (45%) and `--wx-accent-soft`
 * (12%). Three steps of one colour say "ranked" without importing a medal, and
 * they recolour with the theme because they are tokens rather than hexes.
 *
 * ON A PHONE IT STOPS BEING A PODIUM and becomes three compact rows in rank
 * order, which is the rule the screen this replaces got right: a vertical list
 * that starts with second place reads as second place winning, and that is the
 * one thing this screen must never say. Above `sm` the cards sit 2-1-3 with
 * first place taller.
 *
 * NO SPARKLINE HERE, and `board-kit.ts` says why at length: the board function
 * returns one total per creator, so there is no day-by-day series to draw for
 * anybody but the signed-in creator.
 */

/** The accent, at the three strengths the tokens already publish. */
const STRENGTH = ['var(--wx-accent)', 'var(--wx-accent-ring)', 'var(--wx-accent-soft)'];

/** 2-1-3 above `sm`; document order (1-2-3) below it. */
const SIDE_BY_SIDE = ['sm:order-2', 'sm:order-1', 'sm:order-3'];

export function Podium({
  rows,
  faces,
  period,
}: {
  /** Exactly the first three rows of the board, in rank order. */
  rows: LeaderboardRow[];
  faces: Record<string, string>;
  /** The window these figures cover, in words. */
  period: string;
}) {
  const quiet = useReducedMotion();

  return (
    <section
      aria-label="Top three creators"
      /* `-sm`, NOT `wx-neo-raised`: the same glass material with no blur of its
         own. The one blurred page layer on this screen is the sticky "You"
         card, which is the surface content actually scrolls underneath. See the
         note in `Leaderboards.tsx`. */
      className="wx-neo-raised-sm rounded-xl p-3 sm:p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 pb-3">
        <h2 className="text-muted font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
          Top three
        </h2>
        <p className="text-faint text-[0.75rem]">{period}</p>
      </header>

      <ol className="grid gap-2 sm:grid-cols-3 sm:items-end sm:gap-3">
        {rows.map((row, i) => {
          const first = i === 0;
          return (
            <m.li
              key={row.creator_id}
              initial={quiet ? false : { opacity: 0, y: '0.5rem' }}
              animate={{ opacity: 1, y: '0rem' }}
              transition={{ duration: 0.28, delay: quiet ? 0 : i * 0.04, ease: 'easeOut' }}
              className={cn('min-w-0', SIDE_BY_SIDE[i])}
            >
              <article
                className={cn(
                  'wx-neo-inset relative flex min-h-11 items-center gap-3 overflow-hidden rounded-lg py-2.5 pr-3 pl-4',
                  'sm:flex-col sm:items-center sm:gap-1.5 sm:px-3 sm:pt-4 sm:pb-3 sm:text-center',
                  first && 'sm:pt-6 sm:pb-5',
                  // Her own card keeps the accent rim it has everywhere else.
                  row.is_me && 'outline-accent outline-2'
                )}
              >
                {/* The pedestal: a rail down the left on a phone, along the top
                    when the three sit side by side. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[0.1875rem] sm:inset-x-0 sm:inset-y-auto sm:top-0 sm:h-[0.1875rem] sm:w-auto"
                  style={{ background: STRENGTH[i] }}
                />

                <span
                  className={cn(
                    'wx-numeric shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-bold',
                    /* `!` beats `wx-neo-raised-sm`'s own background-color on the
                       filled pill, exactly as the screen this replaces did. */
                    i === 0 &&
                      'wx-neo-raised-sm [background-color:var(--wx-accent-fill)]! [color:var(--wx-on-accent-fill)]',
                    i === 1 && 'bg-accent-soft text-accent',
                    i === 2 && 'wx-neo-raised-sm text-muted'
                  )}
                >
                  #{row.rank}
                </span>

                <CreatorFace
                  /* `size` is this shared component's own API and it is a px
                     number by contract, not a length this screen chose. */
                  size={first ? 52 : 44}
                  src={row.avatar_path ? faces[row.avatar_path] : undefined}
                  name={row.display_name}
                  className={cn('shrink-0', first ? 'ring-accent ring-2' : '')}
                />

                <span className="min-w-0 flex-1 sm:w-full sm:flex-none">
                  <span
                    className={cn(
                      'block truncate font-semibold',
                      first ? 'text-accent text-[1rem]' : 'text-[0.9375rem]'
                    )}
                  >
                    {row.display_name ?? 'A creator'}
                    {row.is_me ? (
                      <span className="text-muted font-semibold"> · you</span>
                    ) : null}
                  </span>
                  <span className="text-faint block text-[0.75rem]">
                    {videosLabel(row.videos)}
                  </span>
                </span>

                <span
                  title={`${tipMoney(row.gmv, row.currency)} GMV`}
                  className={cn(
                    'wx-numeric ml-auto shrink-0 font-mono font-extrabold sm:mt-1 sm:ml-0 sm:w-full',
                    first ? 'text-accent text-[1.25rem]' : 'text-[1.0625rem]'
                  )}
                >
                  {faceMoney(row.gmv, row.currency)}
                  <span className="text-faint ml-1 text-[0.6875rem] font-semibold">GMV</span>
                </span>
              </article>
            </m.li>
          );
        })}
      </ol>
    </section>
  );
}
