import { useMemo } from 'react';
import type { ChartPoint } from '@/components/charts';
import { addDays, dayLabel } from '@/lib/creator/date-range';
import { previousWindow } from '@/lib/creator/daily-totals';
import {
  rangeToDates,
  useDailyPerformance,
  usePerformanceWindow,
  type DailyPerformance,
} from '@/lib/creator/usePerformance';

/**
 * HER FIGURES ON ONE BRAND, for the mini stats in a hub's header.
 *
 * A FILE OF ITS OWN, not a second export on `BrandHeader.tsx`: a module that
 * exports both components and hooks breaks Fast Refresh, so editing the header
 * would reload the whole route instead of swapping the component.
 *
 * NO TIKTOK CALL, and no new RPC. Three reads, all of them calls the creator
 * app already makes, all filtered to `auth.uid()` inside the database and
 * narrowed to this brand by `p_brand_id`:
 *
 *   - `creator_performance_window` for the days worth looking at,
 *   - `creator_daily_performance` for the window,
 *   - the same again for the window immediately before it, which is how the
 *     prompt asks for "vs the previous period". It reads our own nightly table,
 *     so the comparison costs nothing on TikTok's side.
 *
 * WHAT IT NEVER READS: the client behind the brand, or the brand's budget. Both
 * live in `brand_commercials` behind a staff-only policy and no call here names
 * either column.
 */

/** How many days a mini sparkline shows. Locked, deliberately. */
const WINDOW = '30' as const;

/*
 * A HARD CEILING ON THE LOOP, not on the data. `rangeToDates('30', …)` can only
 * return a 30-day span, but it is clamped against a window that arrives from
 * the database, and a loop that walks dates until it passes a server-supplied
 * string is a loop a bad row could hang. Thirty-one is the real answer; this is
 * the seatbelt.
 */
const MAX_DAYS = 96;

/** One stable empty array, so "no rows yet" does not change identity each render. */
const NO_ROWS: DailyPerformance[] = [];

/**
 * One point per DAY IN THE RANGE, not one per row that came back.
 *
 * The daily RPC returns only days it has figures for, so a quiet Tuesday is an
 * ABSENT ROW rather than a zero. Walking the calendar instead of the rows is
 * what turns that absence into a gap in the line; mapping over the rows would
 * join Monday to Wednesday and draw a measurement nobody took.
 */
function densify(
  from: string,
  to: string,
  rows: DailyPerformance[],
  pick: (row: DailyPerformance) => number
): ChartPoint[] {
  const byDay = new Map<string, DailyPerformance>();
  for (const row of rows) byDay.set(String(row.stat_date).slice(0, 10), row);

  const out: ChartPoint[] = [];
  let day = from;
  for (let i = 0; i < MAX_DAYS && day <= to; i += 1) {
    const row = byDay.get(day);
    out.push({ label: dayLabel(day), value: row ? Number(pick(row)) : null });
    day = addDays(day, 1);
  }
  return out;
}

const sum = (rows: DailyPerformance[], pick: (row: DailyPerformance) => number) =>
  rows.reduce((total, row) => total + Number(pick(row)), 0);

export interface BrandMiniStats {
  loading: boolean;
  isError: boolean;
  /** True once the nightly table holds at least one day for this brand. */
  measured: boolean;
  /** Null means not reported. It is NEVER a zero. */
  gmv: number | null;
  gmvBefore: number | null;
  gmvSeries: ChartPoint[];
  videos: number | null;
  videoSeries: ChartPoint[];
  /** TikTok's own currency, as it arrived. Never converted. */
  currency: string | null;
  from: string | null;
  to: string | null;
}

export function useBrandMiniStats(brandId: string | undefined): BrandMiniStats {
  const windowQuery = usePerformanceWindow(brandId);
  const win = windowQuery.data;

  const range = useMemo(() => rangeToDates(WINDOW, win), [win]);
  const before = useMemo(
    () => (range.from && range.to ? previousWindow({ from: range.from, to: range.to }) : null),
    [range.from, range.to]
  );

  const daily = useDailyPerformance(range.from, range.to, null, brandId);
  const dailyBefore = useDailyPerformance(
    before?.from ?? null,
    before?.to ?? null,
    null,
    brandId
  );

  const rows = daily.data ?? NO_ROWS;
  const measured = Boolean(win?.earliest && range.from && range.to);
  const windowLoading = windowQuery.isLoading;
  const windowFailed = windowQuery.isError;
  const dailyLoading = daily.isLoading;
  const dailyFailed = daily.isError;
  const beforeRows = dailyBefore.data;
  const videoCount = win?.videos ?? null;

  return useMemo(() => {
    let gmvSeries: ChartPoint[] = [];
    let videoSeries: ChartPoint[] = [];
    if (measured && range.from && range.to) {
      gmvSeries = densify(range.from, range.to, rows, (r) => r.gross_revenue);
      videoSeries = densify(range.from, range.to, rows, (r) => r.videos);
    }

    return {
      loading: windowLoading || (measured && dailyLoading),
      isError: windowFailed || dailyFailed,
      measured,
      gmv: measured ? sum(rows, (r) => r.gross_revenue) : null,
      /* UNDEFINED DATA IS NOT A ZERO EITHER. While the comparison window is in
         flight there is no previous figure, and `DeltaChip` says exactly that
         rather than printing a percentage against nothing. */
      gmvBefore: measured && beforeRows ? sum(beforeRows, (r) => r.gross_revenue) : null,
      gmvSeries,
      videos: measured ? videoCount : null,
      videoSeries,
      currency: rows.find((r) => r.currency)?.currency ?? null,
      from: range.from,
      to: range.to,
    };
  }, [
    measured,
    range.from,
    range.to,
    rows,
    beforeRows,
    dailyLoading,
    dailyFailed,
    videoCount,
    windowLoading,
    windowFailed,
  ]);
}
