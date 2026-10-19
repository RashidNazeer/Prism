import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { NOT_REPORTED, compact, compactMoney, exactMoney } from '@/components/charts';

/**
 * NULL IS NOT ZERO, ON A CARD FACE.
 *
 * The charts folder owns this rule for graphs (`NOT_REPORTED`, the broken line,
 * the dashed empty track). This file owns it for the FIGURES beside them, which
 * is where the Content page lives or dies: three separate sources are joined in
 * the browser for every video and each one of them is optional, so a card can
 * be missing its GMV, its views, or both, for four different reasons.
 *
 * HOW THE TWO READ DIFFERENTLY, without colour and in both themes:
 *
 *   a real zero   `$0`           upright, mono, bold, full-strength text
 *   not reported  `Not reported`  italic, proportional, muted, with an info dot
 *
 * So the difference is WEIGHT, SLANT, SHAPE and an ICON — four signals, none of
 * them hue. Someone who cannot tell the muted grey from the text grey still
 * reads an italic sentence against a bold number, and a screen reader gets the
 * words either way.
 *
 * A zero is never inferred. `null` arrives from the source and survives all the
 * way to here; nothing in between coalesces it, which is the whole discipline.
 */

/* --------------------------------------------------------- not reported --- */

export function NotReported({
  /** Short form for the tightest cells: the words still, just smaller. */
  small,
  className,
}: {
  small?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <span
        className={cn(
          'text-muted whitespace-nowrap italic',
          small ? 'text-[0.625rem]' : 'text-[0.75rem]'
        )}
      >
        {NOT_REPORTED}
      </span>
    </span>
  );
}

/* --------------------------------------------------------------- figures --- */

/**
 * A count: views, likes, comments, orders.
 *
 * Compact and TRUNCATED on the face (12,489 is 12.4K, never 12.5K), exact in
 * the title, because a figure must never look better than it is.
 */
export function Count({
  value,
  small,
  className,
}: {
  value: number | null;
  small?: boolean;
  className?: string;
}) {
  if (value === null) return <NotReported small={small} className={className} />;
  return (
    <span
      title={value.toLocaleString()}
      className={cn(
        'wx-numeric text-text font-mono font-bold',
        small ? 'text-[0.6875rem]' : 'text-[0.75rem]',
        className
      )}
    >
      {compact(value)}
    </span>
  );
}

/** Money, in the currency the figure arrived in. Never converted. */
export function Money({
  value,
  currency,
  className,
}: {
  value: number | null;
  currency: string | null;
  className?: string;
}) {
  if (value === null) return <NotReported className={className} />;
  return (
    <span
      title={exactMoney(value, currency)}
      className={cn('wx-numeric text-text font-mono font-extrabold', className)}
    >
      {compactMoney(value, currency)}
    </span>
  );
}

/* ----------------------------------------------------------------- rows --- */

/** A label above a figure, for the sheet's stat grid. */
export function Stat({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('wx-neo-raised-sm flex flex-col gap-1 rounded-md px-3 py-2', className)}>
      <span className="text-muted text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
        {label}
      </span>
      <span className="flex min-w-0 items-center text-[1rem]">{children}</span>
    </div>
  );
}
