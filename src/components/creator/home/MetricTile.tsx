import { Info } from 'lucide-react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import { cn } from '@/lib/utils';
import { DeltaChip, NOT_REPORTED } from '@/components/charts';

/**
 * ONE OF THE FOUR TILES THAT ANSWER "HOW AM I DOING".
 *
 * A NUMBER WITH A SHAPE, which is the whole thesis of the redesign: the figure
 * says where she is, the graph under it says how she got there, and the chip
 * says whether that is better than last time.
 *
 * IT IS NOT A BLURRED LAYER. The tile wears `wx-neo-raised-sm` — the same
 * glass tint, rim and lift as a card with the `backdrop-filter` dropped —
 * because four tiles each blurring their own backdrop inside an already
 * blurred panel is four layers over a budget of three. The panel around them
 * does the blurring once.
 *
 * THE WHOLE TILE IS THE TAP TARGET, which also settles the 44px rule for the
 * chart inside it: you are never asked to hit a 10px column, you tap the tile.
 */
export function MetricTile({
  title,
  value,
  footnote,
  now,
  before,
  chart,
  to,
  why,
  index = 0,
}: {
  title: string;
  /** Already formatted. `null` renders the "Not reported" treatment. */
  value: string | null;
  /** The quiet line under the number. */
  footnote?: React.ReactNode;
  now: number | null;
  before: number | null;
  chart: React.ReactNode;
  /** Where tapping goes — My numbers, scrolled to this metric. */
  to: string;
  /** One line explaining WHY a figure is missing, shown beside the info icon. */
  why?: string;
  index?: number;
}) {
  const missing = value === null;

  return (
    <m.div
      /* `h-full` ON BOTH. The grid stretches this wrapper to the tallest tile
         in the row, but the Link inside was only `block`, so the Commission
         tile — which has no big figure and no footnote — stopped short and
         read as a different, smaller card sitting in a gap. */
      className="h-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: index * 0.04 }}
    >
      <Link
        to={to}
        className={cn(
          'wx-neo-raised-sm hover:wx-glass-hover focus-visible:ring-accent/60 group flex h-full min-h-[9rem] flex-col rounded-lg p-4',
          'focus-visible:ring-2 focus-visible:outline-none'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-muted text-[0.6875rem] font-semibold tracking-wide uppercase">
            {title}
          </h3>
          {/*
            A CHIP ONLY WHEN THERE IS SOMETHING TO COMPARE.

            Two cases drop it. Beside a "Not reported" value it said the same
            thing twice and collided with the title at phone width. And when
            the window has no period before it — her first 90 days, say — all
            four tiles carried "Not reported" chips that were reporting on the
            WINDOW, not on her figures. Silence reads as "no comparison yet";
            four identical tags read as four broken numbers.
          */}
          {!missing && before !== null && <DeltaChip now={now} before={before} />}
        </div>

        <div className="mt-2">
          {missing ? (
            <span className="text-muted inline-flex items-center gap-1.5 text-lg font-semibold">
              {NOT_REPORTED}
              {why && (
                <span title={why} aria-label={why}>
                  <Info aria-hidden className="text-faint size-3.5" />
                </span>
              )}
            </span>
          ) : (
            <span className="text-text block text-[1.75rem] leading-none font-bold tabular-nums">
              {value}
            </span>
          )}
          {footnote && <div className="text-muted mt-1 text-[0.6875rem]">{footnote}</div>}
        </div>

        <div className="mt-3 flex-1 content-end">{chart}</div>
      </Link>
    </m.div>
  );
}
