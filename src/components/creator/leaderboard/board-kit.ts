import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import {
  NOT_REPORTED,
  compact,
  compactMoney,
  exactMoney,
  type ChartPoint,
} from '@/components/charts';
import type { LeaderboardRow } from '@/lib/creator/useLeaderboard';
import { addDays, dayLabel, iso } from '@/lib/creator/date-range';
import type { DailyPerformance } from '@/lib/creator/usePerformance';

/**
 * THE PIECES THE BOARD IS BUILT FROM, kept out of the screen itself.
 *
 * Nothing in here invents a figure. Every function either reshapes what
 * `creator_leaderboard` / `my_leaderboard_standing` already returned, or says
 * "Not reported" — see the note on `faceMoney`. Two things this file
 * deliberately does NOT do, because the data cannot support them:
 *
 *   - a per-creator daily trend. `creator_leaderboard` returns eleven columns
 *     and one total per creator; there is no day-by-day series in it for
 *     anybody but the signed-in creator. So a row carries a share-of-the-leader
 *     bar built from the totals already on screen rather than a sparkline built
 *     out of nothing.
 *   - a rank change for another creator. That would mean asking the same
 *     function for the previous period and joining the two boards by creator,
 *     and somebody who was on page four last week is simply not in the answer.
 *     Her OWN rank change is exact, and `Leaderboards.tsx` reads it by asking
 *     `my_leaderboard_standing` for the window before this one.
 *
 * No RPC was changed for this screen, and no new one was added.
 */

/* ----------------------------------------------------------- the periods -- */

export type RangeKey = 'week' | 'month' | 'all';

/**
 * ALL TIME IS THE DEFAULT, carried over from the screen this replaces: "who has
 * sold the most" is not a question about a fortnight.
 */
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

export interface BoardWindow {
  from: string;
  to: string;
}

/** Older than any figure this product holds, so "all time" means all of it. */
export const ALL_TIME_FROM = '2000-01-01';

/**
 * A chip to two dates, in UTC.
 *
 * CALENDAR WEEKS AND CALENDAR MONTHS, not rolling windows, because the chips
 * say "This week" and "This month" and a rolling seven days is neither. UTC
 * throughout for the reason `date-range.ts` gives at length: a stat date is an
 * ad account's own closed day, so a local-time boundary files a day of GMV
 * under the wrong week for anybody east of Greenwich.
 */
export function rangeWindow(key: RangeKey): BoardWindow {
  const to = iso(new Date());
  if (key === 'all') return { from: ALL_TIME_FROM, to };
  if (key === 'month') return { from: `${to.slice(0, 7)}-01`, to };
  // Monday first. `getUTCDay()` is Sunday-based, so rotate it.
  const back = (new Date(`${to}T00:00:00Z`).getUTCDay() + 6) % 7;
  return { from: addDays(to, -back), to };
}

/** "13 Oct 2026 – 16 Oct 2026", so a chip label can never be read two ways. */
export function windowLabel(w: BoardWindow, key: RangeKey): string {
  if (key === 'all') return 'Every day we hold figures for';
  return w.from === w.to ? dayLabel(w.from) : `${dayLabel(w.from)} – ${dayLabel(w.to)}`;
}

/* ------------------------------------------------------------- the figures -- */

/**
 * RPC NUMERICS ARRIVE AS NUMBERS OR AS STRINGS, and a missing one has to stay
 * missing. `Number(null)` is 0, which is the one coercion this product cannot
 * afford: a withheld figure would print as a creator having sold nothing.
 */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * A NULL CURRENCY MEANS THE SUM SPANS MORE THAN ONE, so it gets no symbol.
 *
 * Carried over from the screen this replaces, and it still holds: a board that
 * ranks dollars against pounds under one symbol is not a ranking. The chart
 * kit's money formatters default an unknown currency to USD, which is right on
 * a widget about one creator's own figures and wrong here.
 */

/**
 * THE FIGURE ON A WIDGET FACE: compact, truncated, never rounded up, and
 * "Not reported" rather than 0 when there is no figure at all.
 */
export function faceMoney(v: unknown, currency: string | null): string {
  const n = num(v);
  if (n === null) return NOT_REPORTED;
  return currency ? compactMoney(n, currency) : compact(n);
}

/** The exact figure, for a tooltip or a `title`. */
export function tipMoney(v: unknown, currency: string | null): string {
  const n = num(v);
  if (n === null) return NOT_REPORTED;
  return currency
    ? exactMoney(n, currency)
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

export const videosLabel = (n: number) => `${n} ${n === 1 ? 'video' : 'videos'}`;

/**
 * PLACES MOVED, POSITIVE MEANING UP THE BOARD.
 *
 * `null` when there is no previous standing to compare with, which is a real
 * state: a creator who was not measured last period has not "stayed level".
 */
export function placesMoved(now: number, before: number | null | undefined): number | null {
  if (before === null || before === undefined) return null;
  return before - now;
}

/* ------------------------------------------------- one window of the board -- */

/**
 * FIVE ROWS AROUND A GIVEN RANK, which the paged hook cannot express.
 *
 * `useLeaderboard` asks for page-sized slices on page boundaries, and the two
 * things this screen needs are not on one: the creator directly above her, for
 * "{amount} GMV to pass #11", and the two rows either side of her (§7.5). At
 * rank 51 those are split across two pages, so neither is reachable by paging.
 *
 * SAME FUNCTION, SAME ARGUMENTS, DIFFERENT OFFSET. `creator_leaderboard` takes
 * `p_offset` and `p_limit` already; nothing in the database changed for this.
 * It is its own hook rather than an edit to `useLeaderboard` so the paged query
 * keeps its own cache key and its `keepPreviousData` paging behaviour.
 */
export function useBoardSlice({
  from,
  to,
  offset,
  limit,
  brandId,
  enabled,
}: {
  from: string;
  to: string;
  offset: number;
  limit: number;
  brandId?: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['creator', 'leaderboard', 'slice', from, to, offset, limit, brandId ?? 'all'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await getSupabase().rpc('creator_leaderboard', {
        p_from: from,
        p_to: to,
        p_limit: limit,
        p_offset: offset,
        p_search: null,
        p_brand_id: brandId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as LeaderboardRow[];
    },
  });
}

/* ------------------------------------------------------------- her series -- */

/** A long history is drawn from its last stretch, not through a huge path. */
const MAX_POINTS = 400;

/**
 * HER OWN GMV, DAY BY DAY, shaped for the chart family.
 *
 * The axis starts at the first day that has a figure rather than at the start
 * of the window, so "All time" does not draw a decade of emptiness in front of
 * a creator who started in June. Every day from there to the end of the window
 * gets a point, and a day the nightly job wrote nothing for is `null` — a break
 * in the line, never a drop to zero.
 */
export function dailyGmvSeries(rows: DailyPerformance[] | undefined, to: string): ChartPoint[] {
  const byDay = new Map<string, number>();
  for (const r of rows ?? []) {
    const gmv = num(r.gross_revenue);
    if (r.stat_date && gmv !== null) byDay.set(r.stat_date.slice(0, 10), gmv);
  }
  if (byDay.size === 0) return [];

  const earliest = [...byDay.keys()].sort()[0] as string;
  const span =
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`)) / 86_400_000
    ) + 1;
  const days = Math.max(1, Math.min(span, MAX_POINTS));
  const start = addDays(to, -(days - 1));

  const out: ChartPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = addDays(start, i);
    out.push({ label: dayLabel(day), value: byDay.get(day) ?? null });
  }
  return out;
}

/* --------------------------------------------------------------- the list -- */

/**
 * WHAT THE LIST DRAWS, one entry at a time.
 *
 * The "gap" entry is §7.5's "..." divider, and it carries the number of ranks
 * it stands for, so it reads as an honest fold rather than as rows gone
 * missing.
 */
export type BoardItem = { kind: 'row'; row: LeaderboardRow } | { kind: 'gap'; hidden: number };
