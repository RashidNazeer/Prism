import { cn } from '@/lib/utils';
import { NOT_REPORTED, useChartBox } from './chart-kit';

/**
 * ONE RING, ROUNDED CAP, THE FIGURE IN THE MIDDLE.
 *
 * Three jobs on the creator side: commission as a share of GMV (her effective
 * rate), progress towards the next tier, and time left on a contest.
 *
 * THE TRACK IS ALWAYS DRAWN, including at 0%, so an empty ring reads as "none
 * of it yet" rather than as a chart that failed to load.
 *
 * A null value is NOT a 0% ring. It draws the track alone, dashed, with the
 * centre saying so — the same rule the line charts follow.
 */
export function RingProgress({
  /** 0 to 1. `null` when there is no figure to show. */
  value,
  centre,
  sub,
  token = '--chart-2',
  ariaLabel,
  size = '5rem',
  className,
  /** Drops the ring's gap at the top end, for "already there" states. */
  complete = false,
}: {
  value: number | null;
  /** The big thing in the middle, usually a percentage or a count. */
  centre: string;
  /** A quiet second line under it. */
  sub?: string;
  token?: string;
  ariaLabel: string;
  size?: string;
  className?: string;
  complete?: boolean;
}) {
  const [ref, box] = useChartBox();
  const d = Math.min(box.w, box.h);
  const stroke = Math.max(2, d * 0.1);
  const r = (d - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value));

  return (
    <div
      ref={ref}
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      {d > 0 && (
        <svg width={d} height={d} className="block -rotate-90">
          <circle
            cx={d / 2}
            cy={d / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeDasharray={value === null ? `${stroke * 1.2} ${stroke * 1.2}` : undefined}
            style={{ stroke: 'var(--chart-grid)' }}
          />
          {value !== null && (
            <circle
              cx={d / 2}
              cy={d / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              /* A full ring must not leave the cap's own gap at 12 o'clock. */
              strokeDasharray={complete || pct >= 1 ? undefined : `${c * pct} ${c}`}
              style={{ stroke: `var(${token})` }}
            />
          )}
        </svg>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span
          className={cn(
            'font-semibold tabular-nums',
            value === null ? 'text-faint text-[0.625rem]' : 'text-text text-[0.8125rem]'
          )}
        >
          {value === null ? NOT_REPORTED : centre}
        </span>
        {sub && value !== null && (
          <span className="text-muted mt-0.5 text-[0.625rem]">{sub}</span>
        )}
      </div>
    </div>
  );
}
