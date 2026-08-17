import { useMemo, useState } from 'react';
import { ExternalLink, TrendingUp } from 'lucide-react';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { OrdersChart, PerformanceChart } from '@/components/creator/PerformanceChart';
import {
  RANGES,
  rangeToDates,
  useDailyPerformance,
  usePerformanceWindow,
  useVideoPerformance,
  type RangeKey,
  type VideoPerformance,
} from '@/lib/creator/usePerformance';
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
 */

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'content', label: 'My content' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const money = (n: number, currency: string | null) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(n);

export function MyNumbers() {
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [range, setRange] = useState<RangeKey>('all');

  const windowQ = usePerformanceWindow();
  const { from, to } = useMemo(
    () => rangeToDates(range, windowQ.data),
    [range, windowQ.data]
  );

  const videosQ = useVideoPerformance(from, to);
  const dailyQ = useDailyPerformance(from, to);

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

  const loading = windowQ.isPending || videosQ.isPending || dailyQ.isPending;
  const hasAnyData = videos.some((v) => v.days_with_data > 0);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
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
          The date filter costs nothing, because it never leaves our database.
          It is deliberately a set of ranges rather than two date pickers: a
          creator wants "this month" and "since I started", not a calendar.
        */}
        <FilterTabs label="Over what period">
          {RANGES.map((r) => (
            <FilterTab key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
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
        <Empty
          title="No videos yet"
          body="Post a video against an offer and it appears here. Once we start running ads behind it, the spend, GMV and orders it makes will show up on this screen."
        />
      ) : !hasAnyData ? (
        <Empty
          title="Nothing to report yet"
          body="Your videos are in. Numbers appear the day after we start running ads behind them, and they update every night."
        />
      ) : tab === 'dashboard' ? (
        <Dashboard totals={totals} daily={daily} videos={videos} currency={currency} />
      ) : (
        <Content videos={videos} currency={currency} />
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
}: {
  totals: { cost: number; revenue: number; orders: number; roi: number | null };
  daily: ReturnType<typeof useDailyPerformance>['data'] & object;
  videos: VideoPerformance[];
  currency: string | null;
}) {
  const rows = daily ?? [];
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

function Content({ videos, currency }: { videos: VideoPerformance[]; currency: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {videos.map((v) => {
          const roi = v.roi === null ? null : Number(v.roi);
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
                  {v.brand_name ? (
                    <p className="text-muted mt-0.5 truncate text-[0.75rem]">{v.brand_name}</p>
                  ) : null}
                  <a
                    href={v.video_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent mt-1 inline-flex items-center gap-1 text-[0.75rem] hover:underline"
                  >
                    Watch <ExternalLink size={11} aria-hidden />
                  </a>
                </div>
              </div>

              {v.days_with_data === 0 ? (
                <p className="text-muted border-line border-t px-4 py-3 text-[0.8125rem] leading-relaxed">
                  No ad numbers for this one yet.
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
        Numbers come straight from TikTok and cover complete days only, up to yesterday. Today is
        still being counted, so it appears tomorrow. Days follow the ad account&rsquo;s own
        timezone.
      </span>
    </p>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-line bg-surface-1 rounded-xl border p-10 text-center">
      <h2 className="font-display text-[1.0625rem] font-bold">{title}</h2>
      <p className="text-muted mx-auto mt-2 max-w-prose text-[0.875rem] leading-relaxed">{body}</p>
    </div>
  );
}
