import { type ReactNode } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Info, Store } from 'lucide-react';
import {
  DeltaChip,
  EmptyTrack,
  NOT_REPORTED,
  SparkArea,
  compact,
  compactMoney,
} from '@/components/charts';
import type { CreatorBrand } from '@/lib/creator/useCreatorBrands';
import { cn } from '@/lib/utils';
import type { BrandMiniStats } from './useBrandMiniStats';

/**
 * THE HEAD OF A BRAND HUB: who the brand is, and how SHE is doing on it.
 *
 * TWO FIGURES AND A LINE, not three figures. See the note beside the
 * commission line below: the third tile could never hold a number, so it is a
 * sentence now and the two measured figures get the room.
 *
 * ONE BLURRED LAYER, and it is this element. `wx-neo-raised` carries the only
 * `backdrop-filter` on the page body; everything inside it — the stat tiles,
 * the chips, the segmented control — is the same glass material with the blur
 * left off (`wx-neo-raised-sm`, `wx-neo-inset`). Nesting a second blurred
 * surface in here is what `scripts/check-blur-budget.mjs` exists to catch, so
 * nothing below adds one and nothing in here may be given one later.
 *
 * WHAT IT NEVER READS. The client behind a brand and the budget it allocated
 * live in `brand_commercials`, a staff-only table. Nothing here, and nothing in
 * `useCreatorBrands.ts`, asks for either. The only brand columns on screen are
 * the ones a creator is meant to see: name, logo, tagline.
 */

/* ------------------------------------------------------------------ faces -- */

/** Entrance: opacity and translateY only, and nothing at all when asked. */
function useRise() {
  const quiet = useReducedMotion();
  return (i: number) =>
    quiet
      ? { initial: { opacity: 1 }, animate: { opacity: 1 }, transition: { duration: 0 } }
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.3, ease: 'easeOut' as const, delay: i * 0.04 },
        };
}

/**
 * A FIGURE WE DO NOT HAVE, said in words and never as a zero.
 *
 * Muted text, an info glyph, and the reason itself as a visible line under the
 * figure (the caller's `note`). A tooltip alone would be a gesture nobody
 * performs on a phone, so the words carry it and the glyph only marks it.
 */
function NotReported({ why }: { why: string }) {
  return (
    <span className="text-muted inline-flex items-center gap-1.5 text-[1.0625rem] font-semibold">
      {NOT_REPORTED}
      <Info size={13} aria-hidden className="text-faint shrink-0" />
      <span className="sr-only">{why}</span>
    </span>
  );
}

/**
 * One mini stat: a title, a figure, a sparkline under it.
 *
 * `wx-neo-raised-sm` — the panel's material WITHOUT the blur, which is the
 * layering rule this whole screen is built on. A tile is a widget inside one
 * blurred panel, never a blurred panel of its own.
 *
 * NOT A BUTTON, and that is a decision rather than an oversight. The deep view
 * is already one tap away in the section control directly underneath, and a
 * tile-sized button would have cost two things worth more than a second route
 * to the same screen: a `<div>` inside a `<button>` is invalid markup (the
 * charts render divs and an svg), and an overlay button would sit on top of the
 * sparkline and swallow the tap that shows a day's figure.
 */
function MiniStat({
  title,
  figure,
  note,
  chart,
  delta,
  index,
}: {
  title: string;
  figure: ReactNode;
  note?: ReactNode;
  chart: ReactNode;
  delta?: ReactNode;
  index: number;
}) {
  const rise = useRise();

  return (
    <m.div
      {...rise(index)}
      className="wx-neo-raised-sm flex min-h-[7.5rem] min-w-0 flex-col rounded-xl p-3.5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
          {title}
        </span>
        {delta}
      </div>
      <p className="font-display wx-lining mt-2 text-[1.375rem] leading-none font-semibold">
        {figure}
      </p>
      {note ? <p className="text-faint mt-1.5 text-[0.6875rem] leading-snug">{note}</p> : null}
      <div className="mt-auto pt-3">{chart}</div>
    </m.div>
  );
}

/** The logo well, or a shop glyph when a brand has not uploaded one. */
export function BrandMark({ brand, className }: { brand: CreatorBrand; className?: string }) {
  return (
    <span
      className={cn(
        'wx-neo-inset grid size-12 shrink-0 place-items-center overflow-hidden rounded-full',
        className
      )}
    >
      {brand.logo_url ? (
        <img src={brand.logo_url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <Store size={18} aria-hidden className="text-faint" />
      )}
    </span>
  );
}

/**
 * THE BRAND HEADER.
 *
 * Logo, name, her two measured figures on this brand (and one line for the
 * figure nobody measures), and whatever the hub
 * pins to the foot of it (the section control) or to its top right (the brand
 * switcher). One panel, so the section below it starts high.
 */
export function BrandHeader({
  brand,
  stats,
  action,
  children,
  className,
}: {
  brand: CreatorBrand;
  stats: BrandMiniStats;
  /** Pinned top right. The brand switcher, when there is more than one hub. */
  action?: ReactNode;
  /** The section control, at the foot of the panel. */
  children?: ReactNode;
  className?: string;
}) {
  const { currency } = stats;

  return (
    <section
      aria-labelledby="brand-hub-name"
      className={cn('wx-neo-raised min-w-0 rounded-2xl p-4 sm:p-5', className)}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <BrandMark brand={brand} />
        <div className="min-w-0 flex-1 basis-48">
          <h1 id="brand-hub-name" className="truncate text-[1.25rem] leading-tight font-bold">
            {brand.name}
          </h1>
          {brand.tagline ? (
            <p className="text-muted mt-1 line-clamp-2 text-[0.8125rem] leading-snug">
              {brand.tagline}
            </p>
          ) : null}
        </div>
        {action ? <div className="max-w-full shrink-0">{action}</div> : null}
      </div>

      {/*
        NOTHING MEASURED IS A SENTENCE, NOT TWO EMPTY TILES — 2026-10-17.

        On a brand with no day of figures yet — which is every brand a creator
        has just joined, and the one Rashid screenshotted — both tiles read
        "Not reported" over an empty sparkline track, with a "Not reported"
        delta chip beside one of them. That is 17rem of glass, three separate
        apologies deep, above a panel that was itself three empty cards. The
        same rule as everywhere else on this screen: an absent thing takes less
        room than a present one.

        IT STILL SAYS `NOT_REPORTED`, and still never a zero. The mechanism is
        unchanged; only the room it occupies is.

        A FAILED READ IS NOT AN ABSENCE, and used to be told as one: `measured`
        is false either way, so a leaderboard outage read as "you have no
        figures". It gets its own sentence now.
      */}
      {stats.loading ? (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-busy="true">
          {[0, 1].map((i) => (
            <li key={i} className="wx-skeleton h-[7.5rem] rounded-xl" />
          ))}
        </ul>
      ) : stats.isError ? (
        <p className="text-muted mt-4 max-w-prose text-[0.8125rem] leading-relaxed">
          Your figures for {brand.name} would not load. That is not the same as having none —
          nothing is lost, and they appear here when the read succeeds.
        </p>
      ) : !stats.measured ? (
        <p className="text-muted mt-4 max-w-prose text-[0.8125rem] leading-relaxed">
          Your GMV and your videos on {brand.name}: {NOT_REPORTED}
          <Info size={11} aria-hidden className="mx-1 inline-block align-[-0.1em]" />— no day of
          figures has arrived for this brand yet. They appear here as soon as one does.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MiniStat
            index={0}
            title="Your GMV"
            figure={
              stats.gmv === null ? (
                <NotReported why="No day of figures has arrived for this brand yet." />
              ) : (
                compactMoney(stats.gmv, currency)
              )
            }
            note="Last 30 days"
            delta={<DeltaChip now={stats.gmv} before={stats.gmvBefore} />}
            chart={
              <div className="relative h-[2.75rem] w-full">
                {stats.gmvSeries.length > 0 ? (
                  <SparkArea
                    data={stats.gmvSeries}
                    token="--chart-1"
                    currency={currency}
                    height="2.75rem"
                    ariaLabel={`Your GMV on ${brand.name}, day by day over the last 30 days`}
                  />
                ) : (
                  <EmptyTrack />
                )}
              </div>
            }
          />

          <MiniStat
            index={1}
            title="Your videos"
            figure={
              stats.videos === null ? (
                <NotReported why="No day of figures has arrived for this brand yet." />
              ) : (
                compact(stats.videos)
              )
            }
            note="Measured on this brand, all time"
            chart={
              <div className="relative h-[2.75rem] w-full">
                {stats.videoSeries.length > 0 ? (
                  <SparkArea
                    data={stats.videoSeries}
                    token="--chart-4"
                    money={false}
                    height="2.75rem"
                    ariaLabel={`How many of your videos had figures each day on ${brand.name}, over the last 30 days`}
                  />
                ) : (
                  <EmptyTrack />
                )}
              </div>
            }
          />
        </div>
      )}

      {/*
        COMMISSION IS A LINE, NOT A TILE — 2026-10-17.
        Rashid, after using the hub: "brands hub is really difficult for
        creators to operate". One cause was that a THIRD of the most prominent
        area on the screen was permanently an apology. This tile could never
        hold a figure: `brand_products.commission_rate` is an OFFER TERM (the
        percentage a product pays), nothing links a video to a product, and
        `COMMISSION_IS_MEASURED` in `src/lib/creator/useHomeData.ts` is `false`
        for the same reason. So it rendered `Not reported`, a why-tooltip, a
        caption and an EMPTY SPARKLINE TRACK, in 7.5rem of glass, on every
        brand, forever.

        It still says exactly the same thing — `NOT_REPORTED`, never a computed
        guess, and the rate is still on each product card. It just costs one
        line instead of a third of the header, which is the rule the rest of
        this redesign follows: an absent thing takes less room than a present
        one. The day a measured commission column exists, this line becomes a
        third `MiniStat` again and nothing else here changes.
      */}
      {stats.loading ? null : (
        <p className="text-muted mt-2.5 max-w-prose text-[0.75rem] leading-snug">
          <span className="font-semibold">Your commission: {NOT_REPORTED}</span>
          <Info size={11} aria-hidden className="mx-1 inline-block align-[-0.1em]" />— we do not
          measure commission anywhere. Each product shows the rate you earn on it.
        </p>
      )}

      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
