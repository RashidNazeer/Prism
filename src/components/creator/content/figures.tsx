import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
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

/* ------------------------------------------------------------ the info dot -- */

/**
 * The small "why" beside a missing figure. One line, on tap or on hover.
 *
 * ITS HIT AREA IS BIGGER THAN IT LOOKS. A 0.875rem glyph cannot be a 2.75rem
 * tap target without wrecking a dense card, so the target is grown with a
 * pseudo-element — `before:-inset-3` is 1.5rem of invisible padding on every
 * side, which puts the real touch box at about 3.5rem while the drawn dot stays
 * small. Nothing in the layout moves.
 *
 * It lives inside a card whose whole face is a button (see `VideoCard`), so it
 * stops propagation: tapping "why is this missing" must not also open the
 * sheet.
 */
export function InfoDot({ why, label }: { why: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (wrap.current && e.target instanceof Node && wrap.current.contains(e.target)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative z-20 inline-flex shrink-0 items-center">
      <button
        type="button"
        title={why}
        aria-label={label ?? `Why this says ${NOT_REPORTED.toLowerCase()}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="text-faint hover:text-accent focus-visible:ring-accent/50 relative inline-flex cursor-pointer items-center rounded-full transition-colors before:absolute before:-inset-4 before:content-[''] focus-visible:ring-2 focus-visible:outline-none"
      >
        <Info aria-hidden className="size-3.5" />
      </button>

      {open ? (
        <span
          role="note"
          className="wx-neo-raised-sm text-muted absolute top-full left-0 z-30 mt-1 w-[11rem] rounded-md px-2 py-1.5 text-[0.6875rem] leading-[1.35]"
        >
          {why}
        </span>
      ) : null}
    </span>
  );
}

/* --------------------------------------------------------- not reported --- */

export function NotReported({
  why,
  /** Short form for the tightest cells: the words still, just smaller. */
  small,
  className,
}: {
  why: string;
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
      <InfoDot why={why} />
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
  why,
  small,
  className,
}: {
  value: number | null;
  why: string;
  small?: boolean;
  className?: string;
}) {
  if (value === null) return <NotReported why={why} small={small} className={className} />;
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
  why,
  className,
}: {
  value: number | null;
  currency: string | null;
  why: string;
  className?: string;
}) {
  if (value === null) return <NotReported why={why} className={className} />;
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
