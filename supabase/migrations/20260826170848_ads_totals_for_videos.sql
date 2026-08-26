-- ============================================================================
-- Ad spend and ROI for a named set of videos.
--
-- WHAT THIS IS FOR. Paid Collabs (the vendored WurxBase app at /admin/collabs)
-- keeps its creators' delivered videos as TikTok URLs. We hold what each of
-- those videos cost to advertise and what it sold. This is the one function
-- that joins the two.
--
-- THE JOIN KEY IS TIKTOK'S OWN VIDEO ID, AND THAT IS THE WHOLE TRICK.
-- Rashid expected to have to match Paid Collab brand names against ours and
-- worried about spelling. None of that is needed: their app already extracts
-- the numeric id out of a TikTok URL (`getTikTokVideoId`, App.jsx), and
-- `tiktok_video_daily.item_id` IS that number. So a video either has ad data or
-- it does not, exactly, per video. No name matching, no mapping table to
-- maintain, and every brand with a connected ad account lights up on its own
-- with no configuration.
--
-- SECURITY INVOKER, WHICH IS THE POINT RATHER THAN A DETAIL. The policies on
-- `tiktok_video_daily` decide the rows, not this function:
--   - staff see every video
--   - a creator sees only videos they submitted
--   - anyone else sees nothing
-- So passing a list of ids you do not own returns nothing, and this function
-- adds no reach that the caller did not already have. A DEFINER function here
-- would have quietly handed every creator the whole company's ad spend.
--
-- ROI IS NOT RETURNED, ON PURPOSE. See the comment in
-- 20260818040000_tiktok_video_performance.sql: a ratio cannot be summed, so ROI
-- is computed from these totals at the moment of display. Returning a stored or
-- per-day ROI would invite somebody to average thirty of them, which is simply
-- a different and wrong number.
-- ============================================================================

create or replace function public.ads_totals_for_videos(p_item_ids text[])
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
  /*
   * AN EMPTY ASK IS NOT AN ERROR. A brand with no delivered videos yet is an
   * ordinary state, and making the screen handle an exception for it would mean
   * the screen showing an error where the honest answer is "nothing here yet".
   */
  if n = 0 then
    return;
  end if;

  /*
   * A CEILING, because this list comes from a browser. Two thousand videos is
   * far beyond any real brand and still a trivial index lookup; without a bound
   * a single call could ask for an unbounded array. It raises rather than
   * truncating: a silently shortened list would under-report money, and a wrong
   * number nobody can see is worse than an error somebody can.
   */
  if n > 2000 then
    raise exception 'ads_totals_for_videos: at most 2000 videos per call, asked for %', n;
  end if;

  return query
    select
      d.item_id,
      sum(d.cost)::numeric                         as cost,
      sum(d.gross_revenue)::numeric                as gross_revenue,
      sum(d.orders)::bigint                        as orders,
      /*
       * The currency is reported and never converted. Two ad accounts on
       * different currencies would make a sum of their costs meaningless, so
       * the caller is told rather than handed a number that looks fine.
       */
      min(d.currency)                              as currency,
      count(distinct d.currency) > 1               as mixed_currency,
      min(d.stat_date)                             as first_day,
      max(d.stat_date)                             as last_day
    from public.tiktok_video_daily d
    where d.item_id = any (p_item_ids)
    group by d.item_id;
end;
$$;

comment on function public.ads_totals_for_videos(text[]) is
  'Total ad cost and revenue per TikTok video id, aggregated in SQL. SECURITY INVOKER: the RLS policies on tiktok_video_daily decide which videos the caller may see. ROI is deliberately not returned, because a ratio cannot be summed.';

/*
 * EXPLICIT GRANTS. Postgres grants EXECUTE to PUBLIC on a new function by
 * default, which would include `anon`. Revoked first, then granted narrowly.
 */
revoke all on function public.ads_totals_for_videos(text[]) from public, anon;
grant execute on function public.ads_totals_for_videos(text[]) to authenticated;
grant execute on function public.ads_totals_for_videos(text[]) to service_role;

/*
 * No new index. `tiktok_video_daily` is keyed on (item_id, stat_date), so
 * `item_id = any (...)` is already a primary key lookup.
 */
