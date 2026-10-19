import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { STAGE_META, type OfferStage } from '@/lib/offer-stages';
import type { MyWorkRow } from '@/lib/creator/useMyWork';

/**
 * THE ONLY PART OF HOME THAT ASKS HER TO DO SOMETHING.
 *
 * At most three cards, hardest deadline first. The cap is the point: a queue
 * of eleven things is a list, and a list is something you scroll past. Three
 * is something you finish.
 *
 * NOTHING WAITING IS A GOOD OUTCOME, so it gets a quiet line rather than an
 * empty grey box apologising for itself.
 *
 * WHAT IS *NOT* HERE YET: contest deadlines. §5.1e wants a contest closing
 * soon to appear with a countdown ring, and `useCreatorContests` is a large
 * hook currently being reworked for the Contests screen. Wiring Home into it
 * mid-rewrite would mean guessing at a shape that is still moving, so offers
 * are wired now and contests join once that work lands. The component takes a
 * plain list of actions precisely so that is a one-line addition.
 */

export interface UpNextAction {
  id: string;
  /** The brand this belongs to. */
  brand: string;
  title: string;
  detail: string;
  /** The button's words. One button per card, never two. */
  cta: string;
  to: string;
  /** Lower sorts first. */
  urgency: number;
  badge?: { text: string; tone: 'warning' | 'muted' };
}

/** The stages that mean "the work is now hers to do". */
const HERS_TO_DO: OfferStage[] = ['sample_shipped', 'content_pending'];

export function actionsFromWork(rows: MyWorkRow[] | undefined): UpNextAction[] {
  return (rows ?? [])
    .filter((r) => r.stage && HERS_TO_DO.includes(r.stage))
    .map((r) => {
      const stage = r.stage as OfferStage;
      const since = r.stage_updated_at ? Date.parse(r.stage_updated_at) : Date.now();
      const daysWaiting = Math.floor((Date.now() - since) / 86_400_000);
      return {
        id: r.id,
        brand: r.brand?.name ?? 'A brand',
        title: r.offer?.title ?? STAGE_META[stage].label,
        detail:
          stage === 'content_pending'
            ? `Accepted · no video filed yet${daysWaiting > 0 ? ` · ${daysWaiting}d` : ''}`
            : `Sample on its way${daysWaiting > 0 ? ` · ${daysWaiting}d` : ''}`,
        cta: stage === 'content_pending' ? 'File your video' : 'View',
        to: r.brand?.slug ? `/app/brands/${r.brand.slug}` : '/app/offers',
        /* The longer it has sat, the higher it climbs. */
        urgency: -daysWaiting,
        badge:
          daysWaiting >= 7
            ? ({ text: `${daysWaiting}d waiting`, tone: 'warning' } as const)
            : undefined,
      };
    })
    .sort((a, b) => a.urgency - b.urgency)
    .slice(0, 3);
}

/**
 * A SMALL WIDGET, NOT A SECTION. Rashid: "too huge make it a small widget."
 * It is one nudge: a slim row per action inside a card sized to its content
 * (never a full-width panel), a line of text and a normal-height button.
 * Nothing waiting renders NOTHING: absence costs no room. The card is
 * `wx-neo-raised-sm`, so it adds no blurred layer.
 */
export function UpNext({ actions, className }: { actions: UpNextAction[]; className?: string }) {
  if (actions.length === 0) return null;

  return (
    <ul
      aria-label="Up next"
      className={cn(
        'wx-neo-raised-sm w-fit max-w-full divide-y divide-[var(--wx-glass-edge)] rounded-lg',
        className
      )}
    >
      {actions.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-text truncate font-medium">
              {a.brand} &middot; {a.title}
            </p>
            <p
              className={
                a.badge?.tone === 'warning'
                  ? 'text-warning text-[0.6875rem] font-semibold'
                  : 'text-muted text-[0.6875rem]'
              }
            >
              {a.badge ? a.badge.text : a.detail}
            </p>
          </div>
          <Link
            to={a.to}
            className="bg-accent text-on-accent inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-semibold sm:min-h-9"
          >
            {a.cta}
          </Link>
        </li>
      ))}
    </ul>
  );
}
