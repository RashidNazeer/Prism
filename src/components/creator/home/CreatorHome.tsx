import { useMemo } from 'react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import {
  compact,
  compactMoney,
  Donut,
  exactMoney,
  RingProgress,
  SparkArea,
  SparkBars,
  TrendLine,
  DeltaChip,
} from '@/components/charts';
import { useHomeData, COMMISSION_IS_MEASURED, type HomeData } from '@/lib/creator/useHomeData';
import { summarise, useMyWork, type WorkSummary } from '@/lib/creator/useMyWork';
import { TIER_LABEL, tierTarget } from '@/lib/tiers';
import type { CreatorTier } from '@/lib/auth/auth-context';
import { MetricTile } from './MetricTile';
import { PeriodChips } from './PeriodChips';
import { UpNext, actionsFromWork, type UpNextAction } from './UpNext';
import { PipelineWidget } from './PipelineWidget';
import { BrandChip } from './BrandChip';
import { HomeSkeleton } from './HomeSkeleton';

/**
 * HOME: "HOW AM I DOING, AND WHAT SHOULD I DO NEXT", answered in one screen.
 *
 * No tabs. No switching. The first thing on it is money, and everything else
 * earns its place by leading to more of it.
 *
 * THE GLASS BUDGET, laid out deliberately (§4.3 allows three blurred layers
 * painting at once):
 *   - the top bar blurs (the shell owns that one);
 *   - each SECTION here is one `wx-neo-raised` panel, and only one is ever
 *     fully on screen at a time;
 *   - every widget inside a panel is `wx-neo-raised-sm`: identical tint, rim
 *     and lift, no blur of its own.
 * Four tiles each carrying their own `backdrop-filter` would put five layers
 * on screen before she scrolled.
 */
export function CreatorHome({ name, tier }: { name: string; tier: CreatorTier | null }) {
  const home = useHomeData();
  const work = useMyWork();
  const actions = useMemo(() => actionsFromWork(work.data), [work.data]);
  /* The same rows "Up next" reads, summed the way the jobs screen sums them,
     so the two can never state different money. */
  const pipeline = useMemo(() => (work.data ? summarise(work.data) : null), [work.data]);
  return (
    <CreatorHomeView
      name={name}
      tier={tier}
      home={home}
      actions={actions}
      pipeline={pipeline}
    />
  );
}

/**
 * THE SAME SCREEN, WITH ITS DATA HANDED TO IT.
 *
 * Split out from the container above for one practical reason: NOBODY ON THIS
 * MACHINE HAS A CREATOR LOGIN, so there is no way to open this page signed in
 * and look at it. A pure view can be rendered against made-up figures on the
 * dev route at /dev/home, which is how the spacing, both themes, the phone
 * width and the empty states were actually checked rather than assumed.
 *
 * It is also simply the better shape: the queries live in one place and the
 * layout has no opinion about where its numbers came from.
 */
export function CreatorHomeView({
  name,
  tier,
  home,
  actions,
  pipeline,
}: {
  name: string;
  tier: CreatorTier | null;
  home: HomeData;
  actions: UpNextAction[];
  /** Agreed money, stage by stage. `null` until her work has loaded. */
  pipeline: WorkSummary | null;
}) {
  const { period, totals, previous, currency } = home;
  const numbersLink = (metric: string) => {
    const p = new URLSearchParams();
    p.set('period', period.key);
    if (period.brandId) p.set('brand', period.brandId);
    /* ASK FOR THE SEPARATE VIEW. Tapping the Ad spend tile means "show me ad
       spend", and the deep view's default is now ONE merged chart in which
       only `#gmv` exists as a target — so a link to `#spend` would land on a
       section that is not there. The separate view has a section per metric,
       which is exactly what the tap asked for. */
    p.set('charts', 'separate');
    return `/app/numbers?${p.toString()}#${metric}`;
  };

  if (home.loading) return <HomeSkeleton />;

  /* NEVER MEASURED AT ALL is a different screen from AN EMPTY PERIOD. The
     first needs an explanation, the second needs a way out. */
  if (home.neverAnyData) {
    return (
      <section className="wx-neo-raised rounded-xl p-6">
        <h2 className="text-text text-lg font-semibold">
          {name ? `Hi, ${name}` : 'Welcome'}
        </h2>
        <p className="text-muted mt-2 max-w-prose text-sm">
          Nothing has been measured yet. Your numbers appear here the day after your first
          video starts selling — we read them from a nightly import, so there is nothing for
          you to connect or refresh.
        </p>
        <Link
          to="/app/offers"
          className="text-accent mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium"
        >
          See what is on the table
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </section>
    );
  }

  const effectiveRate = totals.gmv > 0 ? totals.spend / totals.gmv : null;
  const target = tier ? tierTarget(tier, currency) : null;

  return (
    <div className="space-y-6">
      {/* a) HEADER — not glass, just text over the aurora, as §5.1a asks. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted text-sm">{name ? `Hi, ${name}` : 'Your numbers'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-text text-[2.5rem] leading-none font-bold tabular-nums">
              {compactMoney(totals.gmv, currency)}
            </h1>
            <DeltaChip
              now={totals.gmv}
              before={previous?.gmv ?? null}
              suffix={`vs prev ${period.days}d`}
            />
          </div>
          <p className="text-faint mt-1 text-[0.6875rem]">
            TikTok Shop GMV, {exactMoney(totals.gmv, currency)} exactly
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandChip period={period} brands={home.brands} />
          <PeriodChips period={period} window={home.window} />
        </div>
      </header>

      {home.emptyPeriodButHasHistory && (
        <p className="text-muted text-sm">
          Nothing in this period.{' '}
          <button
            type="button"
            onClick={() => period.setPeriod('90')}
            className="text-accent underline underline-offset-2"
          >
            Try the last 90 days
          </button>
          .
        </p>
      )}

      {/* b) THE FOUR TILES. No panel around them: the tiles ARE the cards,
          which is how the reference design reads and one less surface to
          paint. */}
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricTile
            index={0}
            title="GMV"
            value={compactMoney(totals.gmv, currency)}
            footnote={`${exactMoney(totals.gmv, currency)} exactly`}
            now={totals.gmv}
            before={previous?.gmv ?? null}
            to={numbersLink('gmv')}
            chart={
              <SparkArea
                data={home.gmvSeries}
                token="--chart-1"
                currency={currency}
                ariaLabel={`GMV over the last ${period.days} days`}
              />
            }
          />

          {/*
            COMMISSION HAS NO FIGURE, and the tile says so rather than
            guessing. See COMMISSION_IS_MEASURED in useHomeData for the search
            that established it: `commission_rate` is a term on a product, not
            money she earned, and nothing links a performance row to a product.
          */}
          <MetricTile
            index={1}
            title="Commission"
            value={COMMISSION_IS_MEASURED ? compactMoney(0, currency) : null}
            why="We do not measure commission yet — only the rate offered on a product, which is not the same thing."
            now={null}
            before={null}
            to={numbersLink('commission')}
            chart={
              /* A DASHED RULE, NOT A DASHED RING. The ring printed "Not
                 reported" a second time, four lines under the first, in type
                 too small to read — two statements of one absence. The rule
                 holds the chart's place so the four tiles stay the same
                 shape, and says nothing the tile has not already said. */
              <div
                aria-hidden
                className="h-0 w-full border-t border-dashed"
                style={{ borderColor: 'var(--chart-grid)' }}
              />
            }
          />

          <MetricTile
            index={2}
            title="Ad spend"
            value={compactMoney(totals.spend, currency)}
            footnote={
              <>
                {home.videosWithAds > 0
                  ? `Ads on ${home.videosWithAds} video${home.videosWithAds === 1 ? '' : 's'}`
                  : 'No ads in this period'}
                {effectiveRate !== null && (
                  <> &middot; {(Math.trunc(effectiveRate * 1000) / 10).toFixed(1)}% of GMV</>
                )}
              </>
            }
            now={totals.spend}
            before={previous?.spend ?? null}
            to={numbersLink('spend')}
            chart={
              <SparkBars
                data={home.spendSeries}
                token="--chart-3"
                currency={currency}
                ariaLabel={`Ad spend by day over the last ${period.days} days`}
              />
            }
          />

          {/*
            ORDERS, NOT VIEWS. Views live only on the TikTok video table, which
            is filled by a live call — and Home may not make one. See
            FOURTH_METRIC in useHomeData.
          */}
          <MetricTile
            index={3}
            title="Orders"
            value={compact(totals.orders)}
            footnote={
              period.days > 0
                ? `${(Math.trunc((totals.orders / period.days) * 10) / 10).toFixed(1)} a day`
                : undefined
            }
            now={totals.orders}
            before={previous?.orders ?? null}
            to={numbersLink('orders')}
            chart={
              <SparkArea
                data={home.ordersSeries}
                token="--chart-4"
                money={false}
                ariaLabel={`Orders over the last ${period.days} days`}
              />
            }
          />
        </div>
      </section>

      {pipeline && <PipelineWidget summary={pipeline} />}

      {/* c) DAY BY DAY, and whether the ads moved anything. */}
      <section className="wx-neo-raised rounded-xl p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-text text-sm font-semibold">Day by day</h2>
          <span className="text-faint text-[0.6875rem]">Last {period.days} days</span>
        </div>
        <TrendLine
          data={home.gmvSeries}
          spend={home.spendSeries}
          spendScale="own"
          currency={currency}
          ariaLabel={`GMV each day for the last ${period.days} days, with ad spend behind it`}
        />
        {/*
          THE ORGANIC / AD-BACKED SPLIT IS NOT DRAWN, and nothing stands in for
          it.
          §5.1c says to leave it out rather than guess if the data does not
          support it, and it does not: the daily table carries total GMV and
          total ad cost for a day, with nothing saying which SALES the ads
          produced. Spend being non-zero on a day does not make that day's GMV
          ad-backed; splitting it would need attribution we do not hold.

          A stacked bar of "ad spend vs the GMV left over" was tried here and
          removed, because it was worse than nothing: it reads as though her
          GMV is reduced by the ad spend. It is not — the brand's ad account
          pays for those ads, not her.
        */}
      </section>

      {/* d) BY BRAND, AND HER TIER. */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="wx-neo-raised rounded-xl p-4">
          <h2 className="text-text mb-3 text-sm font-semibold">By brand</h2>
          <Donut
            slices={home.brands}
            currency={currency}
            ariaLabel="GMV share by brand"
            onPick={(s) => s.id && period.setBrand(s.id)}
          />
        </div>

        <div className="wx-neo-raised rounded-xl p-4">
          <h2 className="text-text mb-3 text-sm font-semibold">Tier progress</h2>
          <div className="flex items-center gap-4">
            <RingProgress
              value={target ? Math.min(1, totals.gmv / target.threshold) : null}
              centre={tier ? TIER_LABEL[tier] : ''}
              sub="tier"
              token="--chart-2"
              size="7rem"
              complete={!target && tier === 'elite'}
              ariaLabel={
                target
                  ? `Tier ${tier ? TIER_LABEL[tier] : ''}, progress towards ${TIER_LABEL[target.next]}`
                  : 'Tier progress is not available'
              }
            />
            <div className="min-w-0 text-sm">
              {/* "Tier: Rising", never a bare "Rising" beside her role. */}
              <p className="text-text font-semibold">
                Tier: {tier ? TIER_LABEL[tier] : 'Not set'}
              </p>
              {target ? (
                totals.gmv >= target.threshold ? (
                  /*
                   * SHE IS PAST THE FIGURE AND STILL ON THE LOWER TIER, which
                   * is a real state, not a bug: the tier automation named in
                   * the original migration was never built, so `profiles.tier`
                   * is set by hand. "$0 GMV to Pro" would read as a broken
                   * counter; saying what is actually true costs one line.
                   */
                  <p className="text-muted mt-1">
                    Past the {TIER_LABEL[target.next]} figure of{' '}
                    {exactMoney(target.threshold, currency)}. Tiers are reviewed by the Wurx
                    team rather than granted automatically.
                  </p>
                ) : (
                  <p className="text-muted mt-1">
                    {exactMoney(target.threshold - totals.gmv, currency)} GMV to{' '}
                    {TIER_LABEL[target.next]}
                  </p>
                )
              ) : tier === 'elite' ? (
                <p className="text-muted mt-1">Top tier.</p>
              ) : (
                <p className="text-muted mt-1">
                  Next-tier targets are set in US dollars, so there is nothing to compare
                  your figures against here.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* e) UP NEXT. */}
      <section className="wx-neo-raised rounded-xl p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Up next</h2>
        <UpNext actions={actions} />
      </section>

      {/* f) TOP VIDEOS. */}
      <section className="wx-neo-raised rounded-xl p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-text text-sm font-semibold">Top videos this period</h2>
          <Link to="/app/content" className="text-accent text-xs font-medium">
            See all
          </Link>
        </div>
        {(home.topVideos ?? []).length === 0 ? (
          <p className="text-muted text-sm">No videos measured in this period.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {(home.topVideos ?? []).map((v, i) => (
              <m.li
                key={v.item_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: i * 0.04 }}
                className="wx-neo-raised-sm rounded-lg p-3"
              >
                <div className="flex items-start gap-3">
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      loading="lazy"
                      className="size-12 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="bg-surface-2 size-12 shrink-0 rounded-md" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-muted truncate text-[0.6875rem]">
                      {v.brand_name ?? 'Unknown brand'}
                    </p>
                    <p className="text-text truncate text-xs font-medium">
                      {v.video_title ?? 'Untitled video'}
                    </p>
                    <p className="text-text mt-1 text-sm font-bold tabular-nums">
                      {compactMoney(Number(v.gross_revenue), v.currency)}
                    </p>
                  </div>
                </div>
              </m.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
