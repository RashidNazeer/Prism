import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  BrandBars,
  compact,
  compactMoney,
  DeltaChip,
  exactMoney,
  NOT_REPORTED,
  TrendLine,
  type ChartPoint,
} from '@/components/charts';
import { PeriodChips } from '@/components/creator/home/PeriodChips';
import { CombinedChart } from '@/components/creator/home/CombinedChart';
import { BrandChip } from '@/components/creator/home/BrandChip';
import { HomeSkeleton } from '@/components/creator/home/HomeSkeleton';
import { useHomeData, COMMISSION_IS_MEASURED } from '@/lib/creator/useHomeData';
import { cn } from '@/lib/utils';

/**
 * MY NUMBERS: THE DEEP VIEW BEHIND THE HOME TILES.
 *
 * THIS IS THE MOMENT THE PRODUCT EXISTS FOR. A creator logs in and sees their
 * real GMV, not a promise about it. Every number here is the one TikTok
 * reports, in the currency TikTok reports it in, and nothing is rounded into
 * looking better than it is — compact figures TRUNCATE, so 12,489 is 12.4K.
 *
 * NO API CALL HAPPENS ON THIS SCREEN. A nightly job pulls each complete day
 * once and writes it to our own table; this reads that table. Which is why the
 * date filter is free and instant, and why a creator has no way to run up a
 * bill or reach TikTok at all. That property is carried over from the screen
 * this replaces and must survive anything added here.
 *
 * NO TABS, as of the 2026-10 redesign. The old screen had two — Dashboard and
 * My content — and the second was a list of videos living inside a screen
 * about money. That list has its own screen now, so this is one long, calm
 * page reached by tapping a tile on Home.
 *
 * IT SHARES HOME'S STATE, through the URL. §6 asks for exactly that: the
 * period and brand live in search params, so a Home tile links straight here
 * with the same window selected, and a link she sends to somebody opens what
 * she was looking at. It also means these are the SAME queries with the same
 * cache keys, so arriving from Home refetches nothing.
 */

const SECTIONS = [
  { id: 'gmv', label: 'GMV' },
  { id: 'commission', label: 'Commission' },
  { id: 'spend', label: 'Ad spend' },
  { id: 'orders', label: 'Orders' },
] as const;

export function MyNumbers() {
  const home = useHomeData();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  /*
   * ONE CHART, OR ONE PER METRIC. Rashid asked for the graphs merged "and give
   * an option to creator for separate view", so the choice is hers and it
   * lives in the URL beside the period and brand — a link opens the view it
   * was sent from, and a reload does not quietly change it back.
   *
   * COMBINED IS THE DEFAULT because it answers the question the page exists
   * for: did the ad spend move the sales? Three stacked charts made that a
   * question about memory.
   */
  const charts = params.get('charts') === 'separate' ? 'separate' : 'combined';
  const setCharts = (next: 'combined' | 'separate') => {
    const p = new URLSearchParams(params);
    if (next === 'separate') p.set('charts', 'separate');
    else p.delete('charts');
    setParams(p, { replace: true });
  };
  const { period, totals, previous, currency } = home;
  const scrolledTo = useRef<string | null>(null);

  /* A TILE ON HOME LINKS TO `#spend`, so arriving here should land on it.
     Guarded by a ref because the data lands in two passes and scrolling again
     on the second would pull the page out from under her thumb. */
  useEffect(() => {
    const id = hash.replace('#', '');
    if (!id || home.loading || scrolledTo.current === id) return;
    scrolledTo.current = id;
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [hash, home.loading]);

  if (home.loading) return <HomeSkeleton />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <BrandChip period={period} brands={home.brands} />
          <PeriodChips period={period} window={home.window} />
        </div>
        {/* NO DATE RANGE HERE. Rashid: "the date needs to be removed creator
            knows the range dont worry." She chose it one control to the left
            and the chart says "Last 30 days" over the plot; a third statement
            of the same window was the only thing on that line.

            THE VIEW TOGGLE SITS ON THIS ROW, not on one of its own. Alone on a
            second line, right-aligned under a left-aligned row of filters, it
            read as a stray — "give it some symmetry". One row: what you are
            looking at on the left, how you are looking at it on the right. */}
        <button
          type="button"
          onClick={() => setCharts(charts === 'combined' ? 'separate' : 'combined')}
          className="wx-neo-raised-sm text-muted hover:text-text inline-flex min-h-11 items-center rounded-full px-3.5 text-xs font-medium transition-colors sm:min-h-9"
        >
          {charts === 'combined' ? 'Show each metric separately' : 'Show one combined chart'}
        </button>
      </header>

      {/*
        THE JUMP ROW ONLY EXISTS IN THE SEPARATE VIEW.

        Rashid: "the tabs that are loaded with buttons and toggles or sub tabs
        make them simpler to use and ditch the buttons where you can". This one
        had stopped meaning anything: the merged view is ONE chart, so four
        pills offering to scroll to four sections were four buttons that went
        nowhere in particular. A control that does not change what you see does
        not belong on screen.
      */}
      {charts === 'separate' && (
        <nav
          aria-label="Jump to a metric"
          className="wx-glass-chrome sticky top-16 z-20 grid grid-cols-4 gap-1.5 rounded-full p-1.5"
        >
          {SECTIONS.map((s) => {
            const active = hash === `#${s.id}`;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  navigate({ hash: s.id, search: window.location.search }, { replace: true });
                  document
                    .getElementById(s.id)
                    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'wx-neo-raised-sm min-h-11 rounded-full px-2 text-center text-xs transition-colors sm:min-h-9',
                  active ? 'text-text font-bold' : 'text-muted hover:text-text font-medium'
                )}
              >
                {s.label}
              </button>
            );
          })}
        </nav>
      )}

      {home.emptyPeriodButHasHistory && (
        <p className="text-muted text-sm">Nothing measured in this period.</p>
      )}

      {charts === 'combined' ? (
        <section id="gmv" className="wx-neo-raised scroll-mt-32 rounded-xl p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-text text-sm font-semibold">Day by day</h2>
            <span className="text-faint text-[0.6875rem]">Last {period.days} days</span>
          </div>
          <CombinedChart
            gmv={home.gmvSeries}
            spend={home.spendSeries}
            currency={currency}
            days={period.days}
          />
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="GMV" value={compactMoney(totals.gmv, currency)} sub={exactMoney(totals.gmv, currency)} />
            <Stat label="Commission" value={NOT_REPORTED} sub="not measured yet" />
            <Stat label="Ad spend" value={compactMoney(totals.spend, currency)} sub={exactMoney(totals.spend, currency)} />
            <Stat label="Orders" value={compact(totals.orders)} sub={`${totals.orders.toLocaleString()} exactly`} />
          </dl>
        </section>
      ) : (
        <>
      <Section
        id="gmv"
        title="GMV"
        value={compactMoney(totals.gmv, currency)}
        exact={exactMoney(totals.gmv, currency)}
        now={totals.gmv}
        before={previous?.gmv ?? null}
        series={home.gmvSeries}
        currency={currency}
        token="--chart-1"
      />

      {/*
        COMMISSION HAS NO MEASURED FIGURE. Rather than drop the section — which
        would leave its jump pill pointing at nothing — it says plainly what is
        missing and why. See COMMISSION_IS_MEASURED in useHomeData.
      */}
      {/*
        COMPACT, AND ACROSS THE WIDTH. This said the same thing stacked down
        the left edge of a full-width panel, leaving two-thirds of the row
        empty and standing as tall as the real metric sections above it —
        Rashid, of the same fault on "Up next": "this should be smaller". An
        absence should take less room than a figure, not more. The jump pill
        still has somewhere to land, which is why the section is shortened
        rather than removed.
      */}
      <section
        id="commission"
        className="wx-neo-raised scroll-mt-32 rounded-xl p-4 sm:flex sm:items-baseline sm:gap-6"
      >
        <div className="sm:w-48 sm:shrink-0">
          <h2 className="text-text text-sm font-semibold">Commission</h2>
          {!COMMISSION_IS_MEASURED && (
            <p className="text-muted mt-0.5 font-semibold">{NOT_REPORTED}</p>
          )}
        </div>
        {!COMMISSION_IS_MEASURED && (
          <p className="text-muted mt-2 max-w-prose text-xs sm:mt-0">
            We hold the commission <em>rate</em> offered on each product, but not the commission
            you earned &mdash; nothing links a day&rsquo;s sales back to the product that
            produced them. Rather than multiply your GMV by an average and call the result
            money, this stays empty until it can be measured.
          </p>
        )}
      </section>

      <Section
        id="spend"
        title="Ad spend"
        value={compactMoney(totals.spend, currency)}
        exact={exactMoney(totals.spend, currency)}
        now={totals.spend}
        before={previous?.spend ?? null}
        series={home.spendSeries}
        currency={currency}
        token="--chart-3"
        extra={
          <div className="mt-4">
            <h3 className="text-muted mb-2 text-[0.6875rem] font-semibold tracking-wide uppercase">
              Videos with ads behind them
            </h3>
            {(home.topVideos ?? []).filter((v) => Number(v.cost) > 0).length === 0 ? (
              <p className="text-muted text-sm">No ads ran on your videos in this period.</p>
            ) : (
              <ul className="space-y-1">
                {(home.topVideos ?? [])
                  .filter((v) => Number(v.cost) > 0)
                  .map((v) => (
                    <li
                      key={v.item_id}
                      className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-1 text-xs"
                    >
                      <span className="text-text min-w-0 flex-1 truncate">
                        {v.video_title ?? 'Untitled video'}
                      </span>
                      <span className="text-muted shrink-0 tabular-nums">
                        {exactMoney(Number(v.cost), v.currency)} spent &middot;{' '}
                        <span className="text-text font-medium">
                          {exactMoney(Number(v.gross_revenue), v.currency)} GMV
                        </span>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        }
      />

      <Section
        id="orders"
        title="Orders"
        value={compact(totals.orders)}
        exact={totals.orders.toLocaleString()}
        now={totals.orders}
        before={previous?.orders ?? null}
        series={home.ordersSeries}
        currency={currency}
        token="--chart-4"
        money={false}
      />
        </>
      )}

      <section className="wx-neo-raised rounded-xl p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">By brand</h2>
        <BrandBars
          brands={home.brands}
          currency={currency}
          onPick={(b) => b.id && period.setBrand(b.id)}
        />
      </section>
    </div>
  );
}

/**
 * One metric: the full chart, then the three facts worth stating about it.
 *
 * THE AVERAGE DIVIDES BY THE DAYS WE ACTUALLY MEASURED, not by the length of
 * the window. Dividing by 30 when eleven of those days were never reported
 * produces a figure that is too low and labels it an average — the same class
 * of mistake as drawing a missing day at zero. "Days measured" is printed
 * beside it so the denominator is never a secret.
 */
function Section({
  id,
  title,
  value,
  exact,
  now,
  before,
  series,
  currency,
  token,
  money = true,
  extra,
}: {
  id: string;
  title: string;
  value: string;
  exact: string;
  now: number | null;
  before: number | null;
  series: ChartPoint[];
  currency: string | null;
  token: string;
  money?: boolean;
  extra?: React.ReactNode;
}) {
  const measured = series.filter((p) => p.value !== null);
  const best = measured.reduce<ChartPoint | null>(
    (top, p) => (top === null || (p.value ?? 0) > (top.value ?? 0) ? p : top),
    null
  );
  const average =
    measured.length > 0
      ? measured.reduce((t, p) => t + (p.value ?? 0), 0) / measured.length
      : null;

  const fmt = (n: number) => (money ? exactMoney(n, currency) : Math.trunc(n).toLocaleString());

  return (
    <section id={id} className="wx-neo-raised scroll-mt-32 rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-text text-sm font-semibold">{title}</h2>
        <DeltaChip now={now} before={before} suffix="vs previous period" />
      </div>
      <p className="text-text mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-faint text-[0.6875rem]">{exact} exactly</p>

      <div className="mt-3">
        <TrendLine
          data={series}
          currency={currency}
          token={token}
          money={money}
          ariaLabel={`${title} each day for this period`}
        />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Stat
          label="Best day"
          value={best?.value != null ? fmt(best.value) : NOT_REPORTED}
          sub={best?.label}
        />
        <Stat
          label="Daily average"
          value={average !== null ? fmt(average) : NOT_REPORTED}
          sub={measured.length > 0 ? `over ${measured.length} measured days` : undefined}
        />
        <Stat
          label="Days measured"
          value={`${measured.length} of ${series.length}`}
          sub={measured.length < series.length ? 'the rest were not reported' : undefined}
        />
      </dl>

      {extra}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="wx-neo-raised-sm rounded-lg p-2">
      <dt className="text-muted text-[0.625rem] font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-text mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="text-faint text-[0.625rem]">{sub}</dd>}
    </div>
  );
}
