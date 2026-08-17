import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/**
 * A creator's ad numbers.
 *
 * THERE IS NO VIDEO ID IN ANY OF THESE CALLS, and that is the security design
 * rather than an omission. The browser sends a date range and nothing else; the
 * database works out which videos are yours from `auth.uid()`. A client that
 * cannot name a video cannot ask for somebody else's, whatever it sends.
 *
 * NONE OF THIS TOUCHES TIKTOK. Every figure comes from `tiktok_video_daily`,
 * which a nightly job fills one complete day at a time. So changing the date
 * filter is free, unlimited, and instant, and a creator has no way to cause an
 * API call at all.
 *
 * `staleTime` is deliberately long. The underlying data only changes once a
 * night, so refetching on every window focus would be pure noise.
 */

const DAY = 24 * 60 * 60 * 1000;

export type PerformanceWindow = {
  earliest: string | null;
  latest: string | null;
  videos: number;
};

export type VideoPerformance = {
  item_id: string;
  submission_id: string;
  video_url: string;
  video_title: string | null;
  thumbnail_url: string | null;
  brand_id: string | null;
  brand_name: string | null;
  submitted_at: string;
  cost: number;
  gross_revenue: number;
  orders: number;
  roi: number | null;
  cost_per_order: number | null;
  currency: string | null;
  days_with_data: number;
};

export type DailyPerformance = {
  stat_date: string;
  cost: number;
  gross_revenue: number;
  orders: number;
  videos: number;
  currency: string | null;
};

/** The days this creator could sensibly look at. */
export function usePerformanceWindow() {
  return useQuery({
    queryKey: ['creator', 'performance', 'window'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PerformanceWindow> => {
      const { data, error } = await getSupabase().rpc('creator_performance_window');
      if (error) throw error;
      const row = (data as PerformanceWindow[] | null)?.[0];
      return row ?? { earliest: null, latest: null, videos: 0 };
    },
  });
}

export function useVideoPerformance(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['creator', 'performance', 'videos', from, to],
    enabled: Boolean(from && to),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VideoPerformance[]> => {
      const { data, error } = await getSupabase().rpc('creator_video_performance', {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as VideoPerformance[];
    },
  });
}

export function useDailyPerformance(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['creator', 'performance', 'daily', from, to],
    enabled: Boolean(from && to),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DailyPerformance[]> => {
      const { data, error } = await getSupabase().rpc('creator_daily_performance', {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as DailyPerformance[];
    },
  });
}

/* ------------------------------------------------------------ date ranges -- */

export type RangeKey = 'all' | '7' | '30' | '90';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Turn a range choice into two dates.
 *
 * ALL TIME IS THE DEFAULT, and that is Rashid's rule with a reason: a video
 * that ran last month would show a flat zero under month-to-date, and a
 * creator seeing zero against work they know sold is the fastest way to lose
 * their trust in every other number on the screen.
 *
 * THE FLOOR IS THE DAY THEIR FIRST VIDEO EXISTED. Never earlier: an empty
 * stretch before the video was even posted reads as "you earned nothing"
 * rather than "there was nothing yet".
 *
 * THE CEILING IS YESTERDAY, because today is still accruing and we do not
 * store it. Showing a half-written day next to complete ones would make the
 * last bar of every chart look like a collapse.
 */
export function rangeToDates(
  key: RangeKey,
  window: PerformanceWindow | undefined
): { from: string | null; to: string | null } {
  if (!window?.earliest) return { from: null, to: null };

  const yesterday = iso(new Date(Date.now() - DAY));
  const to = window.latest && window.latest < yesterday ? window.latest : yesterday;

  if (key === 'all') return { from: window.earliest, to };

  const back = Number(key);
  const start = iso(new Date(new Date(`${to}T00:00:00Z`).getTime() - (back - 1) * DAY));
  return { from: start < window.earliest ? window.earliest : start, to };
}
