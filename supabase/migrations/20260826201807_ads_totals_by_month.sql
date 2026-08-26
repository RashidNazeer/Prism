-- ============================================================================
-- Ad spend and ROI for a set of videos, WITHIN A DATE RANGE.
--
-- WHY THIS REPLACES THE FUNCTION SHIPPED HOURS AGO. That one summed every day
-- a video ever ran, and the screen it feeds is month-scoped: Paid Collabs has a
-- month selector, and the budget, the allocation and the GMV beside these
-- columns are all "Aug 2026". A lifetime ad spend sitting in that row is not a
-- rounding difference, it is a DIFFERENT PERIOD in the same line of numbers,
-- and the natural thing to do with two numbers in one row is compare them.
--
-- Rashid caught it while testing. He is right, and the fix is the range.
--
-- NULL BOUNDS MEAN NO BOUND, which is what the "All Time" button sends. Both
-- are independent, so an open-ended range works from either side.
--
-- THE DAY BOUNDARY IS THE AD ACCOUNT'S, NOT OURS, and that is not a detail this
-- function gets to choose: `stat_date` was filed under the advertiser's
-- timezone (Etc/GMT+5) by the sync, because that is the only day boundary
-- TikTok reports against. So "August" here means the advertiser's August. A
-- range in any other timezone would silently move money across month ends.
--
-- ROI IS STILL NOT RETURNED. A ratio cannot be summed, so it is computed from
-- these totals at the moment of display, over whatever range is on screen.
-- ============================================================================

/*
 * DROP THE OLD SIGNATURE FIRST.
 *
 * Adding defaulted parameters does not replace a function, it OVERLOADS it, and
 * a two-argument call would then be ambiguous between the old one-argument
 * version and the new one with its defaults. Postgres answers that with
 * "function is not unique" at call time — a runtime error on a screen, from a
 * migration that appeared to succeed.
 */
drop function if exists public.ads_totals_for_videos(text[]);

create or replace function public.ads_totals_for_videos(
  p_item_ids text[],
  p_from     date default null,
  p_to       date default null
)
returns table (
  item_id        text,
  cost           numeric,
  gross_revenue  numeric,
  orders         bigint,
  currency       text,
  mixed_currency boolean,
  first_day      date,
  last_day       date
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  n integer := coalesce(array_length(p_item_ids, 1), 0);
begin
  -- A brand with no delivered videos yet is an ordinary state, not an error.
  if n = 0 then
    return;
  end if;

  /*
   * A CEILING, because this list comes from a browser. It raises rather than
   * truncating: a silently shortened list would under-report money, and a wrong
   * number nobody can see is worse than an error somebody can.
   */
  if n > 2000 then
    raise exception 'ads_totals_for_videos: at most 2000 videos per call, asked for %', n;
  end if;

  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'ads_totals_for_videos: from (%) is after to (%)', p_from, p_to;
  end if;

  return query
    select
      d.item_id,
      sum(d.cost)::numeric           as cost,
      sum(d.gross_revenue)::numeric  as gross_revenue,
      sum(d.orders)::bigint          as orders,
      -- Reported, never converted: summing two currencies would be nonsense.
      min(d.currency)                as currency,
      count(distinct d.currency) > 1 as mixed_currency,
      min(d.stat_date)               as first_day,
      max(d.stat_date)               as last_day
    from public.tiktok_video_daily d
    where d.item_id = any (p_item_ids)
      and (p_from is null or d.stat_date >= p_from)
      and (p_to   is null or d.stat_date <= p_to)
    group by d.item_id;
end;
$$;

comment on function public.ads_totals_for_videos(text[], date, date) is
  'Ad cost and revenue per TikTok video id within a date range, aggregated in SQL. NULL bounds mean unbounded ("All Time"). Dates are the AD ACCOUNT''s days (Etc/GMT+5), because that is the boundary TikTok files against. SECURITY INVOKER: the RLS policies on tiktok_video_daily decide which videos the caller may see. ROI is deliberately not returned, because a ratio cannot be summed.';

/*
 * Postgres grants EXECUTE to PUBLIC on a new function by default, which would
 * include `anon`. Revoked first, then granted narrowly. The old signature's
 * grants died with the DROP above.
 */
revoke all on function public.ads_totals_for_videos(text[], date, date) from public, anon;
grant execute on function public.ads_totals_for_videos(text[], date, date) to authenticated;
grant execute on function public.ads_totals_for_videos(text[], date, date) to service_role;

/*
 * The existing primary key (item_id, stat_date) serves this: the id list is the
 * leading column and the date range is the second, so a range within a set of
 * ids is still an index scan. No new index.
 */
