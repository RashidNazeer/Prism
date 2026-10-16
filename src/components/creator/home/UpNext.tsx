import { Link } from 'react-router';
import { m } from 'motion/react';
import { ArrowRight } from 'lucide-react';
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

export function UpNext({ actions }: { actions: UpNextAction[] }) {
  if (actions.length === 0) {
    return (
      <div className="flex min-h-[6rem] flex-col items-start justify-center gap-2">
        <p className="text-muted text-sm">Nothing waiting on you. Nice.</p>
        <Link
          to="/app/offers"
          className="text-accent inline-flex min-h-11 items-center gap-1 text-sm font-medium"
        >
          See what is on the table
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    /*
      A GRID, NOT A STACK. With one action the stacked list gave a single card
      the full width of the dashboard and a "File your video" button a metre
      wide — Rashid: "this should be smaller as well". There are at most three
      of these, so three columns holds every case: one action occupies a third
      of the row and three fill it evenly. On a phone it falls back to one
      column, where full width is correct.
    */
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((a, i) => (
        <m.li
          key={a.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: i * 0.04 }}
          className="wx-neo-raised-sm rounded-lg p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-muted text-[0.6875rem] font-medium">{a.brand}</span>
            {a.badge && (
              <span
                className={
                  a.badge.tone === 'warning'
                    ? 'text-warning text-[0.625rem] font-semibold'
                    : 'text-muted text-[0.625rem]'
                }
              >
                {a.badge.text}
              </span>
            )}
          </div>
          <p className="text-text mt-0.5 truncate text-sm font-semibold">{a.title}</p>
          <p className="text-muted text-[0.6875rem]">{a.detail}</p>
          <Link
            to={a.to}
            className="bg-accent text-on-accent mt-2 flex min-h-11 w-full items-center justify-center rounded-md px-3 text-sm font-semibold"
          >
            {a.cta}
          </Link>
        </m.li>
      ))}
    </ul>
  );
}
