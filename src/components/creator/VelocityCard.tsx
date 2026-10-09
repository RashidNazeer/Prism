import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { DateRangePicker } from '@/components/creator/DateRangePicker';
import { VelocityChart, type VelocityMetric } from '@/components/creator/VelocityChart';
import {
  usePerformanceWindow,
  useDailyPerformance,
  type DailyPerformance,
} from '@/lib/creator/usePerformance';
import { clamp, presetToRange, type DateRange, type PresetKey } from '@/lib/creator/date-range';
import {
  deltaOf,
  previousWindow,
  spanDays,
  sumDaily,
  type Delta,
} from '@/lib/creator/daily-totals';

/**
 * WHAT THE VIDEOS SOLD, and the shape of it. Home's hero, and the top of My
 * numbers.
 *
 * THREE PARTS ON PURPOSE. `useVelocityData` fetches and compares, `VelocityPanel`
 * draws, and `VelocityCard` is Home's container that owns a date range. Home and
 * My numbers need the SAME figures from the SAME arithmetic but have different
 * chrome around them: Home has one range picker of its own, My numbers already
 * has a range picker and a brand dropdown in its filter bar and must not grow a
 * second set. Splitting the data out is what lets both show one answer. Two
 * screens doing their own slightly different sums on the same numbers is how a
 * creator ends up seeing two answers to one question.
 *
 * FOUR FIGURES, ONE OF THEM FIRST. GMV is the question creators arrive with and
 * the reason this product exists, so it gets the wide tile and the display size.
 * Spend, orders and ROI are what it cost and what it means, and are deliberately
 * smaller. All four are always shown in full: asked how a near-zero ROI should
 * behave, Rashid chose to always show the real number over hiding or playing it
 * down, and that decision governs this card. A creator with $0.52 of spend sees
 * $0.52, and a 0.00x ROI says 0.00x.
 *
 * THE TABS CHANGE THE CHART, NOT THE FIGURES. Every tile keeps reading its own
 * metric whichever tab is selected, so the four can never disagree with each
 * other. Selecting a tile is the same action as selecting its tab, because a
 * figure and the chart behind it are one idea.
 *
 * NO NEW QUERY SHAPE. `creator_daily_performance` already aggregates to one row
 * per day in SQL and takes `p_from`/`p_to`, so the previous period is the same
 * call with the window before. Both carry the hook's five minute `staleTime`;
 * the data changes once a night.
 */

type Totals = ReturnType<typeof sumDaily>;

/**
 * The window, the one before it, and whether comparing them is honest.
 *
 * The previous window can reach back past the creator's first video, where
 * there is nothing to compare with:
 *  - wholly before it: no comparison at all ("All time" lands here, correctly);
 *  - partly before it: compared PER DAY over the days that do exist. Comparing
 *    30 days against 12 would call every creator's second month a triumph.
 */
export function useVelocityData({
  range,
  floor,
  source = null,
  brandId,
}: {
  range: DateRange | null;
  /** The creator's earliest day at this scope, or null if they have none. */
  floor: string | null;
  source?: 'offer' | 'contest' | null;
  brandId?: string;
}) {
  const prev = useMemo(() => {
    if (!range || !floor) return null;
    const w = previousWindow(range);
    if (w.to < floor) return null;
    const from = w.from < floor ? floor : w.from;
    return { range: w, covered: spanDays({ from, to: w.to }), full: spanDays(w) };
  }, [range, floor]);

  const curQ = useDailyPerformance(range?.from ?? null, range?.to ?? null, source, brandId);
  const prevQ = useDailyPerformance(
    prev?.range.from ?? null,
    prev?.range.to ?? null,
    source,
    brandId
  );

  const cur = useMemo(() => sumDaily(curQ.data ?? []), [curQ.data]);
  const before = useMemo<Totals | null>(() => {
    if (!prev || !prevQ.data || !range) return null;
    const s = sumDaily(prevQ.data);
    /* Scaled up to the current length when only part of it is on record. */
    const k = spanDays(range) / prev.covered;
    return prev.covered === prev.full
      ? s
      : { ...s, cost: s.cost * k, revenue: s.revenue * k, orders: s.orders * k };
  }, [prev, prevQ.data, range]);

  const rows: DailyPerformance[] = curQ.data ?? [];
  const days = range ? spanDays(range) : 0;
  const vs = !prev
    ? 'no earlier period to compare'
    : prev.covered < prev.full
      ? `per day vs the ${prev.covered} days before`
      : `vs the previous ${days} ${days === 1 ? 'day' : 'days'}`;

  return {
    rows,
    cur,
    before,
    vs,
    currency: rows.find((r) => r.currency)?.currency ?? null,
    isPending: curQ.isPending,
    isError: curQ.isError,
  };
}

type Tile = {
  id: VelocityMetric;
  label: string;
  tab: string;
  value: string;
  delta: Delta;
  footLeft: string;
  footRight: string | null;
  /** Up is good for GMV and orders; spend on its own is neither. */
  good: 'up' | 'neutral';
  dot: string;
};

const pctText = (d: Delta) =>
  d === null ? null : d.kind === 'new' ? 'new' : `${d.pct >= 0 ? '+' : ''}${d.pct.toFixed(1)}%`;

export function VelocityPanel({
  videos,
  rows,
  cur,
  before,
  vs,
  currency,
  isPending,
  isError,
  controls,
}: {
  /** How many videos this creator has on record at this scope. */
  videos: number;
  rows: DailyPerformance[];
  cur: Totals;
  before: Totals | null;
  vs: string;
  currency: string | null;
  isPending: boolean;
  isError: boolean;
  /** Range and brand pickers, when the surrounding screen does not own them. */
  controls?: ReactNode;
}) {
  const [metric, setMetric] = useState<VelocityMetric>('gmv');

  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency ?? 'USD');
  /* Axis ticks are round and often large; cents on a gridline are noise. */
  const fmtAxis = (n: number) =>
    money(n >= 1000 ? Math.round(n) : Math.round(n * 100) / 100, currency ?? 'USD');

  const avgTicket = cur.orders > 0 ? cur.revenue / cur.orders : null;
  const spendRatio = cur.revenue > 0 ? (cur.cost / cur.revenue) * 100 : null;

  const tiles: Tile[] = [
    {
      id: 'gmv',
      label: 'Total gross merchandise value',
      tab: 'GMV',
      value: fmt(cur.revenue),
      delta: deltaOf(cur.revenue, before?.revenue ?? null),
      footLeft: before ? `Prior period ${fmt(before.revenue)}` : 'No prior period',
      footRight: before
        ? `${cur.revenue - before.revenue >= 0 ? '+' : ''}${fmt(cur.revenue - before.revenue)}`
        : null,
      good: 'up',
      dot: 'bg-chart-2',
    },
    {
      id: 'spend',
      label: 'Ad spend',
      tab: 'Ad spend',
      value: fmt(cur.cost),
      delta: deltaOf(cur.cost, before?.cost ?? null),
      footLeft: 'Paid media behind your videos',
      footRight: spendRatio === null ? null : `${spendRatio.toFixed(1)}% of GMV`,
      good: 'neutral',
      dot: 'bg-chart-3',
    },
    {
      id: 'orders',
      label: 'Orders generated',
      tab: 'Orders',
      value: String(cur.orders),
      delta: deltaOf(cur.orders, before?.orders ?? null),
      footLeft: avgTicket === null ? 'No orders yet' : `Avg. ticket ${fmt(avgTicket)}`,
      footRight: before
        ? `${cur.orders - Math.round(before.orders) >= 0 ? '+' : ''}${cur.orders - Math.round(before.orders)}`
        : null,
      good: 'up',
      dot: 'bg-chart-4',
    },
    {
      id: 'roi',
      label: 'Blended ROI',
      tab: 'ROI trend',
      value: cur.roi === null ? '-' : `${cur.roi.toFixed(2)}x`,
      delta: deltaOf(cur.roi, before?.roi ?? null),
      footLeft: 'GMV divided by paid spend',
      footRight: cur.roi === null ? 'No spend in this period' : null,
      good: 'up',
      dot: 'bg-chart-1',
    },
  ];

  const selected = tiles.find((t) => t.id === metric) ?? tiles[0];
  const formatForMetric = (n: number) =>
    metric === 'orders'
      ? String(Math.round(n))
      : metric === 'roi'
        ? `${n.toFixed(1)}x`
        : fmtAxis(n);

  return (
    <section
      aria-label="Your selling numbers"
      className="wx-neo-raised flex flex-col gap-5 rounded-2xl p-[clamp(1.125rem,2vw,1.5rem)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex flex-wrap items-center gap-2 text-[1.0625rem] leading-none font-semibold">
            TikTok Shop velocity
            <span className="bg-success-soft text-success inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.6875rem] leading-none font-semibold tracking-[0.08em] uppercase">
              <span aria-hidden className="bg-success size-1.5 rounded-full" />
              Live
            </span>
          </h2>
          <p className="text-muted text-[0.8125rem] leading-[1.4]">
            {videos} {videos === 1 ? 'video' : 'videos'} on record
            {' • '}
            {vs}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            A real tablist. These switch which series the chart draws, so they
            are tabs over one panel rather than four buttons: arrow keys move
            between them and a screen reader is told which is current.
          */}
          <div
            role="tablist"
            aria-label="Which number to plot"
            className="wx-neo-inset flex flex-wrap gap-1 rounded-full p-1"
          >
            {tiles.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={metric === t.id}
                aria-controls="velocity-plot"
                onClick={() => setMetric(t.id)}
                className={cn(
                  'wx-neo-press rounded-full px-3 py-1.5 text-[0.75rem] font-semibold whitespace-nowrap transition-colors pointer-coarse:min-h-11',
                  metric === t.id ? 'wx-neo-raised-sm text-text' : 'text-muted hover:text-text'
                )}
              >
                {t.tab}
              </button>
            ))}
          </div>

          {controls}
        </div>
      </div>

      {isError ? (
        <p className="text-muted wx-neo-inset rounded-xl p-4 text-[0.8125rem]">
          We could not load your selling numbers just now. Refresh in a moment.
        </p>
      ) : isPending ? (
        <>
          <div className="wx-skeleton h-28 rounded-xl" />
          <div className="wx-skeleton h-56 rounded-xl" />
        </>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.618fr_1fr_1fr_1fr]">
            {tiles.map((t) => {
              const on = metric === t.id;
              const lead = t.id === 'gmv';
              const up = t.delta?.kind === 'pct' ? t.delta.pct >= 0 : true;
              const tone =
                t.good === 'neutral' || t.delta === null
                  ? 'text-muted'
                  : up
                    ? 'text-success'
                    : 'text-danger';
              return (
                <li key={t.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMetric(t.id)}
                    className={cn(
                      'wx-neo-press flex h-full w-full min-w-0 flex-col gap-2 rounded-xl p-3.5 text-left transition-shadow',
                      on ? 'wx-neo-raised-sm' : 'wx-neo-inset'
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-muted text-[0.6875rem] leading-[1.3] font-semibold tracking-[0.1em] uppercase">
                        {t.label}
                      </span>
                      <span
                        aria-hidden
                        className={cn('mt-1 size-2 shrink-0 rounded-full', t.dot)}
                      />
                    </span>

                    <span className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={cn(
                          'font-brand wx-numeric leading-none font-semibold',
                          lead ? 'text-[clamp(1.75rem,3.2vw,2.5rem)]' : 'text-[1.5rem]'
                        )}
                      >
                        {t.value}
                      </span>
                      {pctText(t.delta) ? (
                        <span
                          className={cn(
                            'wx-numeric inline-flex items-center gap-1 text-[0.75rem] font-semibold',
                            tone
                          )}
                        >
                          {t.good !== 'neutral' && t.delta?.kind === 'pct' ? (
                            <TrendingUp
                              size={12}
                              aria-hidden
                              className={up ? '' : 'rotate-180'}
                            />
                          ) : null}
                          {pctText(t.delta)}
                        </span>
                      ) : null}
                    </span>

                    <span className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <span className="text-subtle text-[0.6875rem] leading-[1.3]">
                        {t.footLeft}
                      </span>
                      {t.footRight ? (
                        <span className="wx-numeric text-muted text-[0.6875rem] font-semibold">
                          {t.footRight}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div
            id="velocity-plot"
            role="tabpanel"
            aria-label={`${selected?.tab ?? 'GMV'} by day`}
            style={{ '--plot-h': 'clamp(9rem, 22vw, 14rem)' } as CSSProperties}
          >
            <VelocityChart
              rows={rows}
              metric={metric}
              formatValue={formatForMetric}
              seriesLabel={selected?.tab ?? 'GMV'}
            />
          </div>

          <p className="text-subtle flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.6875rem] leading-[1.4]">
            <span>
              Every figure here is yours, counted from the videos filed against your account.
            </span>
            <span>From TikTok Shop, updated nightly</span>
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Home's container: owns its own range, because Home has nowhere else to put one.
 *
 * THE RANGE BELONGS HERE AND NOWHERE ELSE ON HOME. The money and counts below
 * are STATE: what is agreed, paid or waiting right now. They have no "last 30
 * days" to be compared with, so the picker deliberately does not reach them.
 */
export function VelocityCard() {
  const windowQ = usePerformanceWindow();
  const [preset, setPreset] = useState<PresetKey>('30');
  const [custom, setCustom] = useState<DateRange | null>(null);

  const range = useMemo<DateRange | null>(
    () =>
      preset === 'custom'
        ? clamp(custom ?? { from: '', to: '' }, windowQ.data)
        : presetToRange(preset, windowQ.data),
    [preset, custom, windowQ.data]
  );

  const data = useVelocityData({ range, floor: windowQ.data?.earliest ?? null });

  if (windowQ.isPending) return <div className="wx-skeleton h-[28rem] rounded-2xl" />;
  /* Nothing to say for a creator with no videos at all. FirstDay covers them. */
  if (!range || !windowQ.data || windowQ.data.videos === 0) return null;

  return (
    <VelocityPanel
      videos={windowQ.data.videos}
      {...data}
      controls={
        <DateRangePicker
          preset={preset}
          range={range}
          window={windowQ.data}
          onChange={(p, r) => {
            setPreset(p);
            setCustom(p === 'custom' ? r : null);
          }}
        />
      }
    />
  );
}
