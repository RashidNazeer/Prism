import { useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ExternalLink, Radio, TrendingUp } from 'lucide-react';
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
import { NeoCardSkeleton } from '@/components/brand/NeoSkeleton';
import { TiltCard, TiltLift } from '@/components/ui/TiltCard';
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
 * THE CHANNEL FILTER IS GONE, 2026-10-08. It was added on 2026-08-20 at
 * Rashid's request — "a tab like offer videos or contest videos and all videos
 * so that they can differentiate" — and he removed it himself, pointing at it:
 * "the circled this I want you to remove it and keep it all time by default."
 *
 * IT COULD BE LEFT SWITCHED ON, which is the part worth remembering. The tabs
 * held their state while everything else on the screen answered a narrower
 * question than the heading implied, so a creator who had once pressed Contest
 * videos came back to a dashboard reading $0.00 with nothing on screen saying
 * why. A filter that can be left on and is easy to miss costs more than the
 * slice it offers.
 *
 * The RPCs keep their `p_source` parameter and `My content` still labels each
 * card's channel, so the question can be asked again without a migration.
 */

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
  /* Every video, always. See the note at the top of the file. */
  const source = null;

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
      </FilterBar>

      {loading ? (
        <div className="flex flex-col gap-3">
          <NeoCardSkeleton className="h-24" />
          <NeoCardSkeleton className="h-64" />
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
      ) : /*
       * The "narrowed to nothing" empty state went with the channel tabs on
       * 2026-10-08. It existed because the filter could be left on and leave
       * a creator staring at zeros; with no filter to leave on, there is
       * nothing to explain away.
       */
      !hasAnyData ? (
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
          latestDataDate={latestDataDate}
        />
      ) : (
        <Content videos={videos} currency={currency} latestDataDate={latestDataDate} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- dashboard -- */

/*
 * HOW MUCH DATA BEHIND A RATIO IS ENOUGH TO LEAN ON.
 *
 * This never hides or changes a figure. It only decides whether the screen adds
 * a plain-English "early read" caveat beside a ratio. Seven days and five orders
 * are a judgement call, not a statistical threshold; they are named here so the
 * day somebody disagrees there is one place to change.
 */
const THIN_DAYS = 7;
const THIN_ORDERS = 5;

const SECTION_LABEL = 'text-muted text-[0.75rem] font-semibold tracking-[0.12em] uppercase';

function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const quiet = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: quiet ? 'auto' : 'smooth', block: 'start' });
}

/**
 * THE ONE QUESTION THIS SCREEN ANSWERS: "what did my videos make, and is it moving?"
 *
 * So the wide column of the golden split holds the headline GMV and the day-by-day
 * line it came from, in one card, and that card is the only thing on the screen
 * that tilts. Everything else is the SUPPORT for that number: what it cost (narrow
 * column, beside it), whether ads are behind the videos at all, and the best day
 * and top video.
 *
 * NOTHING HERE IS HIDDEN, only ordered. Every figure is on the page and exact.
 * What moved behind a disclosure is secondary DETAIL (orders by day, the long
 * explanation of why a young ROI can swing), never the figure itself.
 */
function Dashboard({
  totals,
  daily,
  videos,
  currency,
  adCounts,
  brands,
  inBrandHub,
  latestDataDate,
}: {
  totals: { cost: number; revenue: number; orders: number; roi: number | null };
  daily: DailyPerformance[];
  videos: VideoPerformance[];
  currency: string | null;
  adCounts: { running: number; ran: number; none: number; total: number; withAds: number };
  brands: BrandPerformance[];
  /** Inside one brand's hub, so a per-brand split would be one row of itself. */
  inBrandHub: boolean;
  latestDataDate: string | null;
}) {
  const rows = daily;
  const best = [...rows].sort((a, b) => Number(b.gross_revenue) - Number(a.gross_revenue))[0];
  const topVideo = videos[0];
  const showBrands = !inBrandHub && brands.length > 1;

  const thin = rows.length < THIN_DAYS || totals.orders < THIN_ORDERS;

  const sections = [
    { id: 'mn-money', label: 'Money' },
    { id: 'mn-trend', label: 'Day by day' },
    { id: 'mn-videos', label: 'Videos & ads' },
    ...(showBrands ? [{ id: 'mn-brands', label: 'By brand' }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* On-page navigation: every section below is one tap away. */}
      <nav aria-label="Sections on this page" className="flex flex-wrap items-center gap-2">
        <span className={SECTION_LABEL}>Jump to</span>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jumpTo(s.id)}
            className="wx-neo-raised-sm text-muted hover:text-text focus-visible:outline-line-interactive text-caption min-h-[44px] rounded-full px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ------------------------------- 1. GMV and its line | what it cost -- */}
      <section id="mn-money" aria-labelledby="mn-money-h" className="scroll-mt-24">
        <h2 id="mn-money-h" className="sr-only">
          The money
        </h2>

        <div className="wx-golden items-start">
          {/*
            THE PRIMARY CARD, the only tilted one. `lift={2}`: the chart inside
            has a hover read-out, and at the default 6 degrees a wide card's edge
            travels far enough to slide the point being read out from under the
            cursor (see TiltCard).
          */}
          <TiltCard
            as="div"
            lift={2}
            className="wx-neo-raised flex flex-col gap-5 rounded-xl p-5 sm:p-6"
          >
            <div>
              <p className={SECTION_LABEL}>GMV, your headline number</p>
              <TiltLift depth={20}>
                <p className="font-display wx-numeric text-accent text-h2 sm:text-h1 mt-2 leading-none font-bold">
                  {money(totals.revenue, currency)}
                </p>
              </TiltLift>
              <p className="text-muted text-body mt-3 max-w-prose">
                GMV is the total value of what shoppers bought through your videos.{' '}
                {adCounts.withAds > 0 ? (
                  <>
                    Across {adCounts.withAds} {adCounts.withAds === 1 ? 'video' : 'videos'} with
                    ads, {money(totals.cost, currency)} of ad spend produced{' '}
                    {money(totals.revenue, currency)} in GMV and {totals.orders}{' '}
                    {totals.orders === 1 ? 'order' : 'orders'}.
                  </>
                ) : (
                  <>No ads have run behind your videos in this period yet.</>
                )}
              </p>
            </div>

            <div id="mn-trend" className="scroll-mt-24">
              <PerformanceChart rows={rows} currency={currency} />
            </div>

            <div>
              <Disclosure label="Orders by day">
                <div className="pb-1">
                  <OrdersChart rows={rows} />
                </div>
              </Disclosure>
              <p className="text-faint text-caption leading-relaxed">
                {latestDataDate ? `Complete days up to ${formatDay(latestDataDate)}. ` : ''}
                {rows.length} {rows.length === 1 ? 'day' : 'days'} of data in this view.
              </p>
            </div>
          </TiltCard>

          {/* The cost side: flat, quieter, one card instead of three. */}
          <div className="wx-neo-raised divide-line flex flex-col divide-y rounded-xl p-5 sm:p-6">
            <Metric
              label="Ad spend"
              value={money(totals.cost, currency)}
              note="What was spent on ads behind your videos."
            />
            <Metric
              label="Orders"
              value={String(totals.orders)}
              note="Purchases the ads can be tied to."
            />
            <Metric
              label="Return on ad spend (ROI)"
              value={totals.roi === null ? '—' : `${totals.roi.toFixed(2)}x`}
              badge={totals.roi !== null && thin ? 'Early read' : undefined}
              note={
                totals.roi === null
                  ? 'Nothing has been spent on ads yet, so there is no return to measure.'
                  : `GMV divided by ad spend. For every ${money(1, currency)} spent, ${money(totals.roi, currency)} of sales came back.`
              }
            >
              {totals.roi !== null && thin ? (
                <Disclosure label="Why this can swing">
                  <p className="text-faint text-caption pb-1 leading-relaxed">
                    This rests on only {money(totals.cost, currency)} of spend, {totals.orders}{' '}
                    {totals.orders === 1 ? 'order' : 'orders'} and {rows.length}{' '}
                    {rows.length === 1 ? 'day' : 'days'}, so it can swing a lot. Sales often
                    land days after the spend, which makes a low early ratio common. It becomes
                    a useful guide as more spend and orders build up.
                  </p>
                </Disclosure>
              ) : null}
            </Metric>
          </div>
        </div>
      </section>

      {/* ------------------------- 2. videos & ads | best day and top video -- */}
      <section id="mn-videos" aria-labelledby="mn-videos-h" className="scroll-mt-24">
        <SectionHead
          id="mn-videos-h"
          title="Videos and ads"
          body="Which of your videos have ads behind them. This is what explains most empty cards."
        />
        <div className="wx-golden mt-3 items-start">
          <AdsBand counts={adCounts} />

          <div className="wx-neo-raised divide-line flex flex-col divide-y rounded-xl p-5">
            <div className="pb-4">
              <p className={SECTION_LABEL}>Best day</p>
              {best && Number(best.gross_revenue) > 0 ? (
                <p className="mt-1">
                  <span className="font-display wx-numeric text-lead font-bold">
                    {money(Number(best.gross_revenue), currency)}
                  </span>
                  <span className="text-muted text-caption ml-2">
                    on {formatDay(best.stat_date)}
                  </span>
                </p>
              ) : (
                <p className="text-muted text-caption mt-1">
                  No day has made GMV yet. Your best day appears here when one does.
                </p>
              )}
            </div>

            <div className="pt-4">
              <p className={SECTION_LABEL}>Top performer</p>
              {topVideo && Number(topVideo.gross_revenue) > 0 ? (
                <>
                  <p className="text-body mt-1 truncate font-semibold">
                    {topVideo.video_title || 'Your video'}
                  </p>
                  <p className="text-muted wx-numeric text-caption mt-0.5">
                    {money(Number(topVideo.gross_revenue), currency)} from{' '}
                    {money(Number(topVideo.cost), currency)} spend
                  </p>
                </>
              ) : (
                <p className="text-muted text-caption mt-1">
                  No video has made GMV yet. Open My content to see each one.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- 3. by brand -- */}
      {/*
        WHICH BRAND PAID YOU WHAT. Rashid asked for it by name. Only when there is
        more than one: a single brand would just restate the total above.
      */}
      {showBrands ? (
        <section id="mn-brands" aria-labelledby="mn-brands-h" className="scroll-mt-24">
          <ByBrand brands={brands} />
        </section>
      ) : null}

      <Footnote />
    </div>
  );
}

function SectionHead({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <div>
      <h2 id={id} className="font-display text-lead font-bold">
        {title}
      </h2>
      <p className="text-muted text-caption mt-0.5 leading-relaxed">{body}</p>
    </div>
  );
}

const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

/**
 * PROGRESSIVE DISCLOSURE, not removal. The content stays in the DOM (hidden, not
 * unmounted) and is exact; this only decides whether it is shouted. A real button
 * with `aria-expanded` and `aria-controls`, at the 44px tap floor.
 */
function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="text-muted hover:text-text focus-visible:outline-line-interactive text-caption inline-flex min-h-[44px] items-center gap-1.5 rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {label}
        <ChevronDown
          size={14}
          aria-hidden
          className={cn(
            'transition-transform motion-reduce:transition-none',
            open && 'rotate-180'
          )}
        />
      </button>
      <div id={id} role="region" aria-label={label} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/**
 * One figure in the cost column. The value is exactly what was computed: `0.00x`
 * renders as `0.00x` and `$0.52` as `$0.52`. A label, the figure, one sentence
 * saying what it is, and optionally a pill and a disclosure for the caveat.
 */
function Metric({
  label,
  value,
  note,
  badge,
  children,
}: {
  label: string;
  value: string;
  note: string;
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={SECTION_LABEL}>{label}</p>
        {badge ? (
          <span className="bg-info-soft text-info text-caption inline-flex rounded-full px-2 py-0.5 font-semibold">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="font-display wx-numeric text-h3 mt-1 leading-tight font-bold">{value}</p>
      <p className="text-muted text-caption mt-1 leading-relaxed">{note}</p>
      {children}
    </div>
  );
}

/**
 * Four counts, one picture. Every count is always shown, zero included: a "0"
 * under No ads is an answer, and a missing tile is a question.
 */
function AdsBand({
  counts,
}: {
  counts: { running: number; ran: number; none: number; total: number; withAds: number };
}) {
  const share = (n: number) => (counts.total > 0 ? (n / counts.total) * 100 : 0);
  const parts = [
    {
      key: 'running',
      label: 'Ads running',
      n: counts.running,
      bar: 'bg-success',
      ink: 'text-success',
    },
    { key: 'ran', label: 'Ads finished', n: counts.ran, bar: 'bg-info', ink: 'text-info' },
    { key: 'none', label: 'No ads', n: counts.none, bar: 'bg-line-strong', ink: 'text-faint' },
  ];

  return (
    <div className="wx-neo-raised rounded-xl p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className={SECTION_LABEL}>Videos posted</p>
          <p className="font-display wx-numeric text-h3 mt-1 leading-none font-bold">
            {counts.total}
          </p>
        </div>
        <p className="text-faint text-caption max-w-sm leading-relaxed">
          We don&rsquo;t run GMV Max behind every video. The ones without ads still count
          towards your offer.
        </p>
      </div>

      <div
        className="wx-neo-inset mt-4 flex h-3 overflow-hidden rounded-full"
        role="img"
        aria-label={`${counts.running} running, ${counts.ran} finished, ${counts.none} without ads, out of ${counts.total} videos`}
      >
        {parts.map((p) =>
          p.n > 0 ? (
            <div key={p.key} className={p.bar} style={{ width: `${share(p.n)}%` }} />
          ) : null
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        {parts.map((p) => (
          <div key={p.key}>
            <dt className="text-muted text-caption flex items-center gap-1.5 font-semibold">
              <span className={cn('inline-block h-2 w-2 rounded-full', p.bar)} aria-hidden />
              {p.key === 'running' ? (
                <Radio size={12} aria-hidden className="text-success" />
              ) : null}
              {p.label}
            </dt>
            <dd className={cn('font-display wx-numeric text-lead mt-1 font-bold', p.ink)}>
              {p.n}
            </dd>
          </div>
        ))}
      </dl>
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
              className="wx-neo-raised flex flex-col overflow-hidden rounded-xl"
            >
              <div className="flex gap-3 p-4">
                {v.thumbnail_url ? (
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="h-16 w-12 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="wx-neo-inset h-16 w-12 shrink-0 rounded-md" />
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
                /* GMV leads, large; spend, orders and ROI sit under it as one
                   quiet row. Same four figures, one obvious one. */
                <dl className="border-line flex flex-col gap-3 border-t px-4 py-3">
                  <Figure label="GMV" value={money(Number(v.gross_revenue), currency)} lead />
                  <div className="grid grid-cols-3 gap-x-3">
                    <Figure label="Spend" value={money(Number(v.cost), currency)} />
                    <Figure label="Orders" value={String(v.orders)} />
                    <Figure label="ROI" value={roi === null ? '—' : `${roi.toFixed(2)}x`} />
                  </div>
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
      <span className="wx-neo-raised-sm text-muted inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
        Ads finished
      </span>
    );
  }
  return (
    <span className="wx-neo-raised-sm text-faint inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
      No ads
    </span>
  );
}

function Figure({ label, value, lead }: { label: string; value: string; lead?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'wx-numeric mt-0.5 truncate font-semibold',
          lead ? 'text-accent font-display text-h3 leading-tight' : 'text-body'
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
    <div className="wx-neo-raised rounded-xl p-10 text-center">
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
    <div className="wx-neo-raised rounded-xl p-4 sm:p-5">
      <h2 id="mn-brands-h" className="font-display text-lead font-bold">
        Where your money came from
      </h2>
      <p className="text-muted text-caption mt-0.5">
        Split by the brand whose ads ran behind each video.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {brands.map((b) => (
          <li
            key={b.brand_id ?? 'unmatched'}
            className="wx-neo-inset relative overflow-hidden rounded-xl px-3.5 py-3"
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
    </div>
  );
}
