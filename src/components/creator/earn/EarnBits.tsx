import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Store } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The small parts both Earn tiles are built from.
 *
 * ONE DEFINITION EACH. The brand chip, the status pill and the progress bar
 * were each written out twice — once on an offer and once on a contest — and
 * the copies had already drifted. Two chips for one brand is how a creator gets
 * two answers to one question.
 */

/**
 * THE BRAND, ON ITS OWN MARK, AND IT IS A LINK.
 *
 * Brand hubs are reached by tapping a brand anywhere, so this chip is the way
 * into `/app/brands/:slug` from both lists. The logo falls back to a shop glyph
 * rather than to a blank circle, because a brand with no logo must not look
 * like a brand that failed to load.
 */
export function BrandChip({
  brand,
  className,
}: {
  brand: { name: string; slug: string; logoUrl: string | null } | null;
  className?: string;
}) {
  if (!brand) return null;

  return (
    <Link
      to={`/app/brands/${brand.slug}`}
      className={cn(
        'wx-neo-raised-sm text-muted hover:text-accent ease-brand inline-flex min-w-0 items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-colors',
        className
      )}
    >
      <span className="wx-neo-inset grid size-6 shrink-0 place-items-center overflow-hidden rounded-full">
        {brand.logoUrl ? (
          <img
            src={brand.logoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <Store size={11} aria-hidden className="text-faint" />
        )}
      </span>
      <span className="truncate text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
        {brand.name}
      </span>
    </Link>
  );
}

export type PillTone = 'live' | 'waiting' | 'open' | 'quiet' | 'bad';

/**
 * WHERE THIS CREATOR STANDS, in one pill, in the corner of the tile.
 *
 * Never a colour on its own: each tone has its own word, so the pill reads the
 * same in a forced-colours mode, in a screenshot and to somebody who does not
 * separate green from amber.
 *
 * `live` and `waiting` borrow the stage tokens because they ARE about one
 * creator's own work and money. `open` and `quiet` deliberately do NOT — rule
 * C1: a contest's or an offer's own lifecycle is a different fact from where
 * her work has got to, and "open" is not "paid".
 */
const PILL: Record<PillTone, string> = {
  live: 'bg-stage-paid-soft text-stage-paid',
  waiting: 'bg-stage-due-soft text-stage-due',
  open: 'bg-info-soft text-info',
  quiet: 'bg-surface-2 text-muted',
  bad: 'bg-danger-soft text-danger',
};

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold',
        PILL[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * A bar, with the figure it draws stated beside it in words.
 *
 * NULL IS NOT ZERO HERE EITHER. `share` of `null` draws the empty track and
 * nothing in it, and the caller is expected to put "Not reported" or the real
 * reason in `label` — a bar at 0% and a bar with no figure behind it must not
 * look the same.
 *
 * `role="img"` with the label as the accessible name, so the bar is read out as
 * the sentence it stands for rather than as an unlabelled graphic.
 */
export function MiniBar({
  share,
  label,
  tone = 'accent',
  className,
}: {
  share: number | null;
  label: string;
  tone?: 'accent' | 'paid' | 'warning';
  className?: string;
}) {
  const fill =
    tone === 'paid' ? 'bg-stage-paid' : tone === 'warning' ? 'bg-warning' : 'bg-accent';

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-muted text-[0.75rem] font-medium">{label}</span>
        {share !== null ? (
          <span className="text-faint wx-numeric text-[0.6875rem] font-semibold">
            {Math.round(share * 100)}%
          </span>
        ) : null}
      </div>
      <div
        role="img"
        aria-label={label}
        className="bg-surface-2 mt-1.5 h-[0.375rem] overflow-hidden rounded-full"
      >
        {share !== null ? (
          <span
            aria-hidden
            className={cn('block h-full rounded-full', fill)}
            style={{ width: `${Math.max(share > 0 ? 3 : 0, share * 100)}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** A short note with an icon, for the states that need a sentence not a button. */
export function Note({
  tone,
  icon,
  className,
  children,
}: {
  tone: 'live' | 'waiting' | 'bad' | 'quiet';
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-[0.8125rem] leading-relaxed',
        tone === 'live' && 'bg-stage-paid-soft text-stage-paid',
        tone === 'waiting' && 'bg-stage-due-soft text-stage-due',
        tone === 'bad' && 'bg-danger-soft text-danger',
        tone === 'quiet' && 'wx-neo-inset text-muted',
        className
      )}
    >
      {icon ? (
        <span aria-hidden className="mt-0.5 shrink-0">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">{children}</span>
    </p>
  );
}
