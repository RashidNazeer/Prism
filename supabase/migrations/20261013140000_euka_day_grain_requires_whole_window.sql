-- ============================================================================
-- Day grain may only answer a window it covers COMPLETELY.
--
-- A correction to this morning's migration, caught before anything read it in
-- anger. That version decided between grains with a single watermark: the
-- earliest day marked `ok`. The reasoning was that anything after the floor
-- must be covered.
--
-- It is not. The backfill fills days out of order — `euka_ad_claim_days` takes
-- never-fetched units first and walks BACKWARDS from today, and any day can
-- fail and sit in `failed` for hours. So a window can begin comfortably after
-- the floor and still contain days that were never fetched. The floor test
-- would send that window to the day table, which would answer with the days it
-- happens to hold and no indication that the rest are missing.
--
-- That failure is worse than the one the day grain was introduced to fix. A
-- month-grain answer is too WIDE, which overstates and is visible; this would
-- be too NARROW, which UNDERSTATES. The current month would quietly shrink
-- while the backfill ran, on a page about money, and nothing on screen would
-- say why.
--
-- So the test becomes exact: use days only when every day in the requested
-- window is present and `ok`. Any hole at all, from any cause, falls back to
-- months — which is the behaviour the page has today and therefore cannot be a
-- regression. As the backfill completes, windows start qualifying on their own.
-- ============================================================================

-- A window is covered when no day inside it is missing or unfinished.
--
-- "Missing" has to be judged against the days we MEANT to fetch, not against
-- the calendar: there is no reason to expect a day older than the backfill
-- horizon, and demanding one would mean no window ever qualifies. So the test
-- is that the window's whole span exists as units and every one of them is ok.
create or replace function public.euka_ad_day_window_covered(p_from date, p_to date)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p_from is not null
    and p_to is not null
    and p_from <= p_to
    -- Every calendar day in the window must appear as a finished unit.
    and not exists (
      select 1
      from generate_series(p_from, p_to, interval '1 day') g(d)
      where not exists (
        select 1 from public.euka_ad_sync_days s
        where s.day = g.d::date and s.status = 'ok'
      )
    );
$$;

revoke all on function public.euka_ad_day_window_covered(date, date) from public, anon;
grant execute on function public.euka_ad_day_window_covered(date, date) to authenticated, service_role;

-- The reader, with the floor test replaced by the window test. Everything else
-- is unchanged, including the shape it returns and the month fallback.
create or replace function public.euka_ad_totals_for_videos(
  p_item_ids text[],
  p_from date default null,
  p_to date default null
)
returns table (
  item_id        text,
  cost           numeric,
  gross_revenue  numeric,
  orders         bigint,
  currency       text,
  mixed_currency boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_use_days boolean;
begin
  if coalesce(array_length(p_item_ids, 1), 0) > 2000 then
    raise exception 'euka_ad_totals_for_videos: at most 2000 videos per call'
      using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'euka_ad_totals_for_videos: the range ends before it starts'
      using errcode = '22023';
  end if;

  -- An open-ended window reaches past any backfill, so it can never qualify.
  v_use_days := public.euka_ad_day_window_covered(p_from, p_to);

  if v_use_days then
    return query
      select d.item_id,
             sum(d.cost)::numeric,
             sum(d.gross_revenue)::numeric,
             sum(d.orders)::bigint,
             case when count(distinct d.currency) = 1 then min(d.currency) end,
             count(distinct d.currency) > 1
      from public.euka_ad_video_day d
      where d.item_id = any (p_item_ids)
        and d.day >= p_from
        and d.day <= p_to
      group by d.item_id;
  else
    return query
      select m.item_id,
             sum(m.cost)::numeric,
             sum(m.gross_revenue)::numeric,
             sum(m.orders)::bigint,
             case when count(distinct m.currency) = 1 then min(m.currency) end,
             count(distinct m.currency) > 1
      from public.euka_ad_video_month m
      where m.item_id = any (p_item_ids)
        and (p_from is null or m.month >= date_trunc('month', p_from)::date)
        and (p_to is null or m.month <= p_to)
      group by m.item_id;
  end if;
end;
$$;

revoke all on function public.euka_ad_totals_for_videos(text[], date, date) from public, anon;
grant execute on function public.euka_ad_totals_for_videos(text[], date, date) to authenticated, service_role;

-- Coverage reporting gains the one fact a screen actually needs: whether the
-- window it is about to ask for will be answered exactly, so it can say so
-- rather than leaving the reader to guess which grain replied.
--
-- DROPPED FIRST, because `create or replace` cannot add a column to a function
-- that returns a table: Postgres refuses with 42P13, "cannot change return type
-- of existing function". Nothing reads it yet — it was written this morning —
-- so dropping is safe here and would not be once a screen depends on it.
drop function if exists public.euka_ad_day_coverage();

create or replace function public.euka_ad_day_coverage()
returns table (
  day_floor    date,
  days_ok      bigint,
  days_pending bigint,
  days_failed  bigint,
  last_ok_day  date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    min(day) filter (where status = 'ok'),
    count(*) filter (where status = 'ok'),
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'failed'),
    max(day) filter (where status = 'ok')
  from public.euka_ad_sync_days;
$$;

revoke all on function public.euka_ad_day_coverage() from public, anon;
grant execute on function public.euka_ad_day_coverage() to authenticated, service_role;
