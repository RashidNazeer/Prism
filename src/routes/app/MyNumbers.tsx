import { useMemo, useState } from 'react';
import { ExternalLink, Radio, TrendingUp } from 'lucide-react';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { OrdersChart, PerformanceChart } from '@/components/creator/PerformanceChart';
import {
  useDailyPerformance,
  usePerformanceWindow,
  useVideoPerformance,
  useBrandPerformance,
  adStateOf,
  type AdState,
  type DailyPerformance,
  type VideoPerformance,
  type BrandPerformance,
} from '@/lib/creator/usePerformance';
import {
  ceilingOf,
  clamp,
  presetToRange,
  type DateRange,
  type PresetKey,
} from '@/lib/creator/date-range';
import { DateRangePicker } from '@/components/creator/DateRangePicker';
import { BrandFilter } from '@/components/creator/BrandFilter';
import { cn } from '@/lib/utils';

/**
 * My numbers: what the ads behind a creator's videos actually did.
 *
 * THIS IS THE MOMENT THE PRODUCT EXISTS FOR. A creator logs in and sees their
 * real GMV, not a promise about it. So every number here is the one TikTok
 * reports, denominated in the currency TikTok reports it in, and nothing is
 * rounded into looking better than it is.
 *
 * NO API CALL HAPPENS ON THIS SCREEN. A nightly job pulls each complete day
 * once and writes it to our own table; this reads that table. Which is why the
 * date filter is free and instant, and why a creator has no way to run up a
 * bill or reach TikTok at all.
 *
 * TWO TABS, and the default is Dashboard because the first question is "how am
 * I doing", not "list my videos".
 *
 * AND A THIRD ROW OF CONTROLS, from 2026-08-20: which CHANNEL the videos came
 * through. Rashid: "in my numbers section users can have a tab like offer
 * videos or contest videos and all videos so that they can differentiate that
 * their which video whether in offers or contest, is going well."
 *
 * It filters in the DATABASE, not here, so the chart, the tiles and the cards
 * all answer the same question. Slicing an already-fetched list in the browser
 * would have left the chart showing everything while the tiles showed a
 * subset, which is the exact disagreement this screen was already carrying
 * between its tiles and its chart until this week.
 */

const SOURCES = [
  { key: null, label: 'All videos' },
  { key: 'offer', label: 'Offer videos' },
  { key: 'contest', label: 'Contest videos' },
] as const;
type SourceKey = (typeof SOURCES)[number]['key'];

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'content', label: 'My content' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/*
 * A NULL CURRENCY MEANS THE SUM SPANS MORE THAN ONE, and it must not be given a
 * symbol. The read functions return null rather than picking one off the set
 * (20260820230000), so this renders the figure bare: visibly odd, which is what
 * it is, instead of confidently wrong. The product is USD only by decision, so
 * this should never fire — it exists so the day that changes is a question
 * somebody asks rather than money quietly adding up wrong.
 */
const money = (n: number, currency: string | null) =>
  currency
    ? new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(n)
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

/**
 * ONE SCREEN, TWO PLACES IT LIVES.
 *
 * `/app/numbers` renders it with no brand, and it answers for every brand the
 * creator works with, exactly as it always has. A Brand Hub renders the same
 * component with that hub's `brandId`, and every figure on it narrows to that
 * brand.
 *
 * THE NARROWING HAPPENS IN THE DATABASE, NEVER HERE. Each hook passes
 * `p_brand_id` down to the RPC, which filters the money rows and the video set
 * together. Filtering the returned array in the browser would look identical
 * and be wrong: a card's `brand_id` is the brand that spent MOST on that video
 * over its lifetime, while its cost and GMV are sums across every advertiser,
 * so `videos.filter(v => v.brand_id === brandId)` would hand this brand another
 * brand's spend and compute ROI against a denominator that was never theirs.
 */
export function MyNumbers({ brandId }: { brandId?: string } = {}) {
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [source, setSource] = useState<SourceKey>(null);

  /*
   * WHICH BRAND, when this is the standalone screen.
   *
   * Rashid, 2026-10-07: "In the numbers tab I want a drop down to select
   * different brands for whom I want to see the numbers."
   *
   * INSIDE A BRAND HUB THE PROP WINS and the dropdown is never drawn: that
   * screen IS one brand, and a control offering to leave it would be a second
   * answer to a question the route has already settled.
   */
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);
  const effectiveBrandId = brandId ?? pickedBrand ?? undefined;

  /*
   * TWO WINDOWS, and only one of them usually costs a request.
   *
   * `baseWindow` is the creator's whole history at this route's scope — every
   * brand on `/app/numbers`, this brand inside a hub. It feeds the brand list,
   * which must NOT shrink when a brand is chosen, or picking one would empty the
   * dropdown that picked it.
   *
   * `scopedWindow` follows the dropdown and feeds the ranges and the empty
   * state, so "All time" means all time FOR THIS BRAND. With nothing picked the
   * two have identical query keys, so React Query serves one request.
   */
  const baseWindowQ = usePerformanceWindow(brandId);
  const windowQ = usePerformanceWindow(effectiveBrandId);

  /*
   * ANY DATE RANGE, since 2026-10-07. The four fixed tabs became a calendar
   * with shortcuts; see `src/lib/creator/date-range.ts` for why none of it
   * needed a migration.
   */
  const [preset, setPreset] = useState<PresetKey>('all');
  const [custom, setCustom] = useState<DateRange | null>(null);

  const active = useMemo<DateRange | null>(
    () =>
      preset === 'custom'
        ? clamp(custom ?? { from: '', to: '' }, windowQ.data)
        : presetToRange(preset, windowQ.data),
    [preset, custom, windowQ.data]
  );
  const from = active?.from ?? null;
  const to = active?.to ?? null;

  /*
   * THE BRANDS THIS CREATOR ACTUALLY HAS VIDEOS WITH, over their whole history.
   *
   * Taken from the videos rather than from `creator_brand_performance`, which
   * only knows brands with MONEY rows: a creator whose first two videos have
   * earned nothing yet would get an empty dropdown from that source, which is
   * exactly the creator most likely to go looking for one. Taken over the base
   * window rather than the chosen range for the same reason the window is split
   * above. With the default "All time" range this is the same query key as the
   * main video fetch, so it is free until somebody narrows the dates.
   */
  const baseFrom = baseWindowQ.data?.earliest ?? null;
  const baseTo = baseWindowQ.data ? ceilingOf(baseWindowQ.data) : null;
  const brandSourceQ = useVideoPerformance(
    brandId ? null : baseFrom,
    brandId ? null : baseTo,
    null
  );
  const brandOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of brandSourceQ.data ?? []) {
      if (v.brand_id && v.brand_name && !seen.has(v.brand_id))
        seen.set(v.brand_id, v.brand_name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [brandSourceQ.data]);

  const videosQ = useVideoPerformance(from, to, source, effectiveBrandId);
  /*
   * "Where your money came from" is a split BY brand, so inside a single
   * brand's hub it is one row restating the tile above it. Not fetched there
   * at all rather than fetched and hidden, because the round trip is the cost.
   * The same now applies once the dropdown has narrowed to one brand.
   */
  const splitOff = Boolean(effectiveBrandId);
  const brandsQ = useBrandPerformance(splitOff ? null : from, splitOff ? null : to);
  const dailyQ = useDailyPerformance(from, to, source, effectiveBrandId);

  const videos = videosQ.data ?? [];
  const daily = dailyQ.data ?? [];

  const currency =
    videos.find((v) => v.currency)?.currency ?? daily.find((d) => d.currency)?.currency ?? null;

  const totals = useMemo(() => {
    const cost = videos.reduce((s, v) => s + Number(v.cost), 0);
    const revenue = videos.reduce((s, v) => s + Number(v.gross_revenue), 0);
    const orders = videos.reduce((s, v) => s + Number(v.orders), 0);
    return {
      cost,
      revenue,
      orders,
      // Computed here rather than averaged from the rows: a ratio of sums is
      // the only version that is right at every zoom level.
      roi: cost > 0 ? revenue / cost : null,
    };
  }, [videos]);

  /*
   * HOW MANY VIDEOS ARE ACTUALLY CARRYING ADS, which Rashid asked for by name:
   * "in dashboard total no off videos they posted and no of videos ads are
   * running on and no of videos ads not running on".
   *
   * It matters because a card with no numbers is otherwise ambiguous, and the
   * wrong reading, "the product has lost my data", is the one that costs trust.
   * On his real roster it is 44 of 46, so two creators would have been staring
   * at two blank cards with no explanation.
   *
   * Counted from a list already in memory, so this is not a second round trip.
   */
  const latestDataDate = useMemo(
    () => (daily.length > 0 ? daily[daily.length - 1]!.stat_date : null),
    [daily]
  );

  const adCounts = useMemo(() => {
    let running = 0;
    let ran = 0;
    let none = 0;
    for (const v of videos) {
      const state = adStateOf(v, latestDataDate);
      if (state === 'running') running++;
      else if (state === 'ran') ran++;
      else none++;
    }
    return { running, ran, none, total: videos.length, withAds: running + ran };
  }, [videos, latestDataDate]);

  const loading = windowQ.isPending || videosQ.isPending || dailyQ.isPending;
  const hasAnyData = videos.some((v) => v.days_with_data > 0);

  return (
    <div className="flex flex-col gap-4">
      {/*
        TABS LEFT, FILTERS RIGHT. Rashid asked for the new controls to keep the
        row "practical and symmetrical", and the row already had three groups of
        tabs fighting for the same edge. What you are LOOKING AT stays on the
        left; what you are NARROWING IT BY is pinned right in the action slot,
        so the bar reads as two halves rather than five things in a queue. Below
        40rem FilterBar wraps them, and `wx-tap-row` keeps every control at the
        44px tap floor.
      */}
      <FilterBar
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {brandId ? null : (
              <BrandFilter
                brands={brandOptions}
                value={pickedBrand}
                onChange={setPickedBrand}
              />
            )}
            <DateRangePicker
              preset={preset}
              range={active}
              window={windowQ.data}
              onChange={(p, r) => {
                setPreset(p);
                setCustom(p === 'custom' ? r : null);
              }}
            />
          </div>
        }
      >
        <FilterTabs label="What to look at">
          {TABS.map((t) => (
            <FilterTab
              key={t.key}
              active={tab === t.key}
              count={t.key === 'content' ? videos.length : undefined}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </FilterTab>
          ))}
        </FilterTabs>

        {/*
          WHICH CHANNEL. It sits beside the period rather than above the tabs
          because it is a filter on the same question, not a different screen:
          "how am I doing" and "how am I doing on contest work" are the same
          question with a narrower subject.
        */}
        <FilterTabs label="Which videos">
          {SOURCES.map((sv) => (
            <FilterTab
              key={sv.key ?? 'all'}
              active={source === sv.key}
              onClick={() => setSource(sv.key)}
            >
              {sv.label}
            </FilterTab>
          ))}
        </FilterTabs>
      </FilterBar>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="wx-skeleton h-24 rounded-xl" />
          <div className="wx-skeleton h-64 rounded-xl" />
        </div>
      ) : windowQ.data && windowQ.data.videos === 0 ? (
        /*
         * "No videos yet" used to be true here, because this screen counted
         * every video a creator had posted. Since 2026-08-19 it counts only
         * APPROVED ones, so somebody with three videos waiting to be checked
         * would have read a flat contradiction of their own Content page.
         */
        <Empty
          title="No approved videos yet"
          body="A video shows up here once the team has watched it and approved it. Then, when we start running ads behind it, the spend, GMV and orders it makes appear on this screen. Anything still being checked is on your Content page."
        />
      ) : videos.length === 0 && source !== null ? (
        /*
         * NARROWED TO NOTHING, which is a different thing from having nothing.
         * A creator who has never entered a contest and taps Contest videos
         * must not be told their numbers are missing; the filter is what is
         * empty, and the way out is one tap away.
         */
        <Empty
          title={source === 'contest' ? 'No contest videos yet' : 'No offer videos yet'}
          body={
            source === 'contest'
              ? 'Nothing you have filed against a contest has been approved yet. Approved contest videos show their spend and GMV here, the same as offer videos do.'
              : 'Nothing you have filed against an offer has been approved yet. Tap All videos to see everything you have.'
          }
        />
      ) : !hasAnyData ? (
        <Empty
          title="Nothing to report yet"
          body="Your videos are in. Numbers appear the day after we start running ads behind them, and they update every night."
        />
      ) : tab === 'dashboard' ? (
        <Dashboard
          totals={totals}
          daily={daily}
          videos={videos}
          currency={currency}
          adCounts={adCounts}
          brands={brandsQ.data ?? []}
          inBrandHub={Boolean(brandId)}
        />
      ) : (
        <Content videos={videos} currency={currency} latestDataDate={latestDataDate} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- dashboard -- */

function Dashboard({
  totals,
  daily,
  videos,
  currency,
  adCounts,
  brands,
  inBrandHub,
}: {
  totals: { cost: number; revenue: number; orders: number; roi: number | null };
  daily: DailyPerformance[];
  videos: VideoPerformance[];
  currency: string | null;
  adCounts: { running: number; ran: number; none: number; total: number; withAds: number };
  brands: BrandPerformance[];
  /** Inside one brand's hub, so a per-brand split would be one row of itself. */
  inBrandHub: boolean;
}) {
  const rows = daily;
  const best = [...rows].sort((a, b) => Number(b.gross_revenue) - Number(a.gross_revenue))[0];
  const topVideo = videos[0];

  return (
    <div className="flex flex-col gap-4">
      {/*
        Four numbers, and GMV is the big one. It is the figure a creator came to
        see, so it is not one tile of four equal tiles.
      */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="GMV" value={money(totals.revenue, currency)} big />
        <Stat label="Ad spend" value={money(totals.cost, currency)} />
        <Stat label="Orders" value={String(totals.orders)} />
        <Stat
          label="ROI"
          value={totals.roi === null ? '—' : `${totals.roi.toFixed(2)}x`}
          hint={totals.roi === null ? 'no spend yet' : 'GMV for every 1 spent'}
        />
      </section>

      {/*
        WHICH BRAND PAID YOU WHAT. Rashid asked for it by name: "let creators
        see that in which brand they got how many money so they can analyse."

        Only when there is more than one. A creator working for a single brand
        would just be reading their own total again with a heading on it, and a
        panel that repeats the number above it teaches people to stop reading
        panels.
      */}
      {!inBrandHub && brands.length > 1 ? <ByBrand brands={brands} /> : null}

      {/*
        WHICH OF YOUR VIDEOS ARE CARRYING ADS. Not every video gets GMV Max
        behind it, and a creator who does not know that reads an empty card as
        the product losing their money rather than as no campaign.
      */}
      <section className="border-line bg-surface-1 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border p-4">
        <div>
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
            Videos posted
          </p>
          <p className="font-display wx-numeric mt-1 text-[1.375rem] font-bold">
            {adCounts.total}
          </p>
        </div>
        <div className="border-line h-9 border-l" aria-hidden />
        <div>
          <p className="text-muted flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
            <Radio size={12} aria-hidden className="text-success" />
            Ads running
          </p>
          <p className="font-display wx-numeric text-success mt-1 text-[1.375rem] font-bold">
            {adCounts.running}
          </p>
        </div>
        {adCounts.ran > 0 ? (
          <div>
            <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
              Ads finished
            </p>
            <p className="font-display wx-numeric mt-1 text-[1.375rem] font-bold">
              {adCounts.ran}
            </p>
          </div>
        ) : null}
        <div>
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
            No ads
          </p>
          <p className="font-display wx-numeric text-faint mt-1 text-[1.375rem] font-bold">
            {adCounts.none}
          </p>
        </div>
        <p className="text-faint max-w-xs text-[0.75rem] leading-relaxed">
          We don&rsquo;t run GMV Max behind every video. The ones without ads still count
          towards your offer.
        </p>
      </section>

      <section className="border-line bg-surface-1 rounded-xl border p-5">
        <PerformanceChart rows={rows} currency={currency} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border-line bg-surface-1 rounded-xl border p-5">
          <OrdersChart rows={rows} />
        </section>

        <section className="border-line bg-surface-1 flex flex-col gap-4 rounded-xl border p-5">
          <div>
            <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
              Best day
            </p>
            {best ? (
              <p className="mt-1">
                <span className="font-display wx-numeric text-[1.25rem] font-bold">
                  {money(Number(best.gross_revenue), currency)}
                </span>
                <span className="text-muted ml-2 text-[0.8125rem]">
                  on{' '}
                  {new Date(`${best.stat_date}T00:00:00Z`).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  })}
                </span>
              </p>
            ) : (
              <p className="text-muted mt-1 text-[0.875rem]">Nothing yet.</p>
            )}
          </div>

          <div className="border-line border-t pt-4">
            <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
              Top performer
            </p>
            {topVideo && Number(topVideo.gross_revenue) > 0 ? (
              <>
                <p className="mt-1 truncate text-[0.9375rem] font-semibold">
                  {topVideo.video_title || 'Your video'}
                </p>
                <p className="text-muted wx-numeric mt-0.5 text-[0.8125rem]">
                  {money(Number(topVideo.gross_revenue), currency)} from{' '}
                  {money(Number(topVideo.cost), currency)} spend
                </p>
              </>
            ) : (
              <p className="text-muted mt-1 text-[0.875rem]">Nothing yet.</p>
            )}
          </div>
        </section>
      </div>

      <Footnote />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  big,
}: {
  label: string;
  value: string;
  hint?: string;
  big?: boolean;
}) {
  return (
    <div className="border-line bg-surface-1 rounded-xl border p-4">
      <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          'font-display wx-numeric mt-1.5 font-bold',
          big ? 'text-accent text-[1.75rem]' : 'text-[1.375rem]'
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-faint mt-0.5 text-[0.6875rem]">{hint}</p> : null}
    </div>
  );
}

/* --------------------------------------------------------------- content -- */

function Content({
  videos,
  currency,
  latestDataDate,
}: {
  videos: VideoPerformance[];
  currency: string | null;
  latestDataDate: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {videos.map((v) => {
          const roi = v.roi === null ? null : Number(v.roi);
          const adState = adStateOf(v, latestDataDate);
          return (
            <article
              key={v.item_id}
              className="border-line bg-surface-1 flex flex-col overflow-hidden rounded-xl border"
            >
              <div className="flex gap-3 p-4">
                {v.thumbnail_url ? (
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="border-line h-16 w-12 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <div className="bg-surface-2 border-line h-16 w-12 shrink-0 rounded-md border" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-semibold">
                    {v.video_title || 'Your video'}
                  </p>
                  <p className="text-muted mt-0.5 flex flex-wrap items-center gap-x-1.5 truncate text-[0.75rem]">
                    {v.brand_name ? <span className="truncate">{v.brand_name}</span> : null}
                    {/*
                      Which channel this one came through, so the All view is
                      readable without switching filters to work it out. Only
                      the word, in the muted ink: a coloured pill here would
                      compete with the ad-status chip, which is the thing on
                      this card that actually changes.
                    */}
                    {v.brand_name ? <span aria-hidden>·</span> : null}
                    <span>
                      {v.source === 'both'
                        ? 'Offer and contest'
                        : v.source === 'contest'
                          ? 'Contest'
                          : 'Offer'}
                    </span>
                  </p>
                  <a
                    href={v.video_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent mt-1 inline-flex items-center gap-1 text-[0.75rem] hover:underline"
                  >
                    Watch <ExternalLink size={11} aria-hidden />
                  </a>
                </div>

                {/*
                  The badge answers "are you running ads on this one" before the
                  creator has to work it out from an empty card. Never colour
                  alone: each state carries its own word.
                */}
                <AdBadge state={adState} />
              </div>

              {adState === 'none' ? (
                <p className="text-muted border-line border-t px-4 py-3 text-[0.8125rem] leading-relaxed">
                  We haven&rsquo;t run ads behind this one, so there is nothing to report. It
                  still counts towards your offer.
                </p>
              ) : v.days_with_data === 0 ? (
                <p className="text-muted border-line border-t px-4 py-3 text-[0.8125rem] leading-relaxed">
                  Ads ran on this one, but not in the period you picked.
                  {Number(v.lifetime_revenue) > 0
                    ? ` All time it made ${money(Number(v.lifetime_revenue), currency)}.`
                    : ''}
                </p>
              ) : (
                <dl className="border-line grid grid-cols-2 gap-x-4 gap-y-3 border-t px-4 py-3">
                  <Figure label="GMV" value={money(Number(v.gross_revenue), currency)} accent />
                  <Figure label="Spend" value={money(Number(v.cost), currency)} />
                  <Figure label="Orders" value={String(v.orders)} />
                  <Figure label="ROI" value={roi === null ? '—' : `${roi.toFixed(2)}x`} />
                </dl>
              )}
            </article>
          );
        })}
      </div>
      <Footnote />
    </div>
  );
}

/**
 * Running, finished, or never. Colour is never the only carrier: each state
 * says its own word, so it reads the same to somebody who cannot tell the green
 * from the grey.
 */
function AdBadge({ state }: { state: AdState }) {
  if (state === 'running') {
    return (
      <span className="bg-success-soft text-success inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
        <Radio size={10} aria-hidden />
        Ads on
      </span>
    );
  }
  if (state === 'ran') {
    return (
      <span className="bg-surface-2 text-muted inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
        Ads finished
      </span>
    );
  }
  return (
    <span className="border-line text-faint inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold">
      No ads
    </span>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-faint text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'wx-numeric mt-0.5 text-[0.9375rem] font-semibold',
          accent && 'text-accent'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The honest small print, and it earns its place.
 *
 * Today is missing on purpose and a creator WILL notice, so it is said out loud
 * rather than left as a mystery gap at the end of every chart. And the day
 * boundary is the ad account's, not theirs, which is why a figure can look like
 * it landed on the wrong date if you are counting in your own timezone.
 */
function Footnote() {
  return (
    <p className="text-faint flex items-start gap-2 text-[0.75rem] leading-relaxed">
      <TrendingUp size={13} aria-hidden className="mt-0.5 shrink-0" />
      <span>
        Numbers come straight from TikTok and cover complete days only, up to yesterday. Today
        is still being counted, so it appears tomorrow. Days follow the ad account&rsquo;s own
        timezone.
      </span>
    </p>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-line bg-surface-1 rounded-xl border p-10 text-center">
      <h2 className="font-display text-[1.0625rem] font-bold">{title}</h2>
      <p className="text-muted mx-auto mt-2 max-w-prose text-[0.875rem] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- which brand -- */

/**
 * A creator's own money, split by the brand whose ad account paid for it.
 *
 * IT IS THE MONEY ROW'S BRAND, NOT THE OFFER'S. A submission says which brand a
 * video was filed against; the money row says which brand's ad account actually
 * spent on it. Those agree for an ordinary video and diverge for one that two
 * brands both promoted, and only the money row can split that honestly.
 *
 * THE BAR IS PROPORTIONAL TO THE BEST BRAND, not to the total, so the shape of
 * "where does my money come from" is readable without reading a number. Rows
 * are already ordered by GMV in the database.
 *
 * NOTHING HERE IS ABOUT THE BRAND. Its name, and this creator's own figures
 * against it. No budget, no other creators, no campaign detail — those are
 * staff facts and this is a creator screen.
 */
function ByBrand({ brands }: { brands: BrandPerformance[] }) {
  const best = Math.max(...brands.map((b) => Number(b.gmv) || 0), 0);

  return (
    <section className="border-line bg-surface-1 rounded-xl border p-4 sm:p-5">
      <h2 className="text-[1rem] font-bold">Where your money came from</h2>
      <p className="text-muted mt-0.5 text-[0.8125rem]">
        Split by the brand whose ads ran behind each video.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {brands.map((b) => (
          <li
            key={b.brand_id ?? 'unmatched'}
            className="border-line bg-surface-2 relative overflow-hidden rounded-xl border px-3.5 py-3"
          >
            <div
              aria-hidden
              className="bg-accent/10 pointer-events-none absolute inset-y-0 left-0"
              style={{ width: `${best > 0 ? Math.max(2, (Number(b.gmv) / best) * 100) : 0}%` }}
            />
            <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] font-semibold">
                  {/* A row with no brand is money whose store mapping changed.
                      Say so plainly rather than printing "null". */}
                  {b.brand_name ?? 'Not matched to a brand'}
                </p>
                <p className="text-faint text-[0.75rem]">
                  {b.videos} {b.videos === 1 ? 'video' : 'videos'} ·{' '}
                  {money(Number(b.spend), b.currency)} spent ·{' '}
                  {b.roi === null ? 'no spend' : `${Number(b.roi).toFixed(2)}x`}
                </p>
              </div>
              <p className="wx-numeric text-accent font-mono text-[1.125rem] font-extrabold">
                {money(Number(b.gmv), b.currency)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
