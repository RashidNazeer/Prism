import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NOT_REPORTED } from './chart-kit';

/**
 * HOW IT MOVED AGAINST THE PREVIOUS PERIOD OF THE SAME LENGTH.
 *
 * NEVER COLOUR ALONE. The arrow and the sign carry the direction; the colour
 * only reinforces it. A creator who cannot tell the green from the red still
 * reads the arrow, and so does a screen reader, which gets the whole thing in
 * words.
 *
 * NOT REPORTED IS NOT FLAT. If either side of the comparison is missing there
 * is no percentage to state, so it says so rather than printing 0%. A previous
 * period of zero is the same problem wearing a number: every change from zero
 * is infinite, so that case says "no figure before" instead of "+100%".
 */
export function DeltaChip({
  now,
  before,
  className,
  /** A plain-words suffix for the label, e.g. "vs prev 30d". */
  suffix,
}: {
  now: number | null;
  before: number | null;
  className?: string;
  suffix?: string;
}) {
  const missing = now === null || before === null;
  const fromZero = !missing && before === 0;

  if (missing || fromZero) {
    return (
      <span
        className={cn(
          'text-faint inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem]',
          className
        )}
        title={fromZero ? 'Nothing in the period before this one' : NOT_REPORTED}
      >
        <ArrowRight aria-hidden className="size-3" />
        {fromZero ? 'no figure before' : NOT_REPORTED}
      </span>
    );
  }

  const pct = ((now - before) / Math.abs(before)) * 100;
  /* TRUNCATED, like every other figure on a widget face: a 9.97% rise is 9.9%,
     never 10.0%. */
  const shown = (Math.trunc(Math.abs(pct) * 10) / 10).toFixed(1);
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : ArrowRight;
  const tone = dir === 'up' ? 'text-success' : dir === 'down' ? 'text-danger' : 'text-muted';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium tabular-nums',
        tone,
        className
      )}
    >
      <Icon aria-hidden className="size-3" />
      <span>
        {dir === 'up' ? '+' : dir === 'down' ? '−' : ''}
        {shown}%
      </span>
      {suffix && <span className="text-muted font-normal">{suffix}</span>}
    </span>
  );
}
