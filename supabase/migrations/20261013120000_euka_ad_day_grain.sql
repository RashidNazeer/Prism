-- ============================================================================
-- Ad figures per DAY, so a date range can be answered honestly.
--
-- Rashid, 2026-10-13, about the brand page: the calendar "should allow clients
-- to select date range as well like it is on the creator login", and the data
-- "should be able to be seen using a date range or last 7 days", while we keep
-- fetching from Euka on a schedule "so that we donot waste the request limit".
--
-- WHY THIS IS NEEDED AT ALL. The figures are already cached rather than fetched
-- live — `euka-ads-sync` fills `euka_ad_video_month` and the screen reads our
-- own tables in milliseconds. But they are stored one row per MONTH, and
-- `euka_ad_totals_for_videos` therefore counts a month whenever it OVERLAPS the
-- requested range. Ask it for the last 7 days and it returns the whole month's
-- spend. Today nothing asks, because the screen only offers whole months; the
-- moment a range picker exists that silence becomes a wrong number on a page
-- about money. So the grain has to be refined before the control ships, not
-- after.
--
-- THE ARITHMETIC IS KNOWN TO BE SAFE. The original migration recorded the
-- check: on 2026-09-15 seven single-day calls summed to the same $427.71 as one
-- seven-day call. Splitting the window does not move a number.
--
-- WHAT THIS COSTS IN EUKA CALLS, HONESTLY. An earlier draft of this comment
-- claimed day grain would be CHEAPER than months. It is not, and the arithmetic
-- is worth writing down so nobody re-derives the wrong answer later. Against
-- dev's 471 month units (~94 campaigns), re-read every 20 hours:
--
--   months                        ~94 x 1 open month    ~110 calls/day
--   days, Euka's 3-day rewrite    ~94 x 3 open days     ~340 calls/day
--
-- So about three times the month path. That is the price of being able to
-- answer a window narrower than a month at all, and it is bounded rather than
-- open-ended: a day older than Euka's rewrite window is fetched ONCE and never
-- becomes due again, where an open month is re-read for the whole month.
-- The 90-day backfill is a separate, one-off cost of roughly 94 x 90 calls,
-- drip-fed through the existing throttled queue so it never bursts.
--
-- THE MONTH TABLE STAYS. It holds history that predates any of this, and
-- `euka-ads-sync` keeps writing it. The reader below decides which grain can
-- answer a given question and never mixes the two, because adding a day row to
-- a month row that already contains it would double count.
-- ============================================================================

-- ------------------------------------------------------------- the figures --
create table public.euka_ad_video_day (
  item_id        text not null check (item_id ~ '^[0-9]{6,32}$'),
  day            date not null,
  store_id       text not null,
  advertiser_id  text not null,
  campaign_id    text not null,
  cost           numeric(14, 2) not null default 0,
  orders         integer not null default 0,
  gross_revenue  numeric(14, 2) not null default 0,
  currency       text,
  synced_at      timestamptz not null default now(),
  -- Same shape as the month table: one video can run in several campaigns and
  -- under two ad accounts, each its own row, and the reader sums them.
  primary key (item_id, day, advertiser_id, campaign_id)
);
create index euka_ad_video_day_day_idx on public.euka_ad_video_day (day);
create index euka_ad_video_day_unit_idx
  on public.euka_ad_video_day (advertiser_id, campaign_id, day);
-- The reader filters by item and then by day, and a range is the common case.
create index euka_ad_video_day_item_day_idx
  on public.euka_ad_video_day (item_id, day);

comment on table public.euka_ad_video_day is
  'GMV Max ad cost, orders and ad-attributed revenue per TikTok video per campaign per DAY, copied from EUKA by euka-ads-sync. Only rows where something moved. The month-grain twin is euka_ad_video_month.';

-- ------------------------------------------------------- the work, as units --
-- One unit is one campaign's DAY, mirroring `euka_ad_sync_units`.
create table public.euka_ad_sync_days (
  advertiser_id    text not null,
  campaign_id      text not null,
  day              date not null,
  store_id         text not null,
  store_name       text,
  advertiser_name  text,
  campaign_name    text,
  status           text not null default 'pending'
                   check (status in ('pending', 'ok', 'failed')),
  attempts         integer not null default 0,
  row_count        integer,
  cost             numeric(14, 2),
  last_error       text,
  synced_at        timestamptz,
  due_at           timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (advertiser_id, campaign_id, day)
);
create index euka_ad_sync_days_due_idx on public.euka_ad_sync_days (due_at);
-- The coverage watermark below reads this; without an index it is a seq scan
-- on every call of the reader.
create index euka_ad_sync_days_ok_day_idx
  on public.euka_ad_sync_days (day) where status = 'ok';

comment on table public.euka_ad_sync_days is
  'One campaign-day of GMV Max figures to fetch from EUKA. A day older than EUKA''s 3-day rewrite window is fetched once and never becomes due again.';

-- ------------------------------------------------------------- row security --
alter table public.euka_ad_video_day enable row level security;
alter table public.euka_ad_sync_days enable row level security;

create policy euka_ad_video_day_select_collabs on public.euka_ad_video_day
  for select to authenticated using (public.is_collabs_viewer());
create policy euka_ad_sync_days_select_collabs on public.euka_ad_sync_days
  for select to authenticated using (public.is_collabs_viewer());

-- "Automatically expose new tables" is off, which also drops the default
-- grants to service_role. Without these the sync silently sees nothing.
grant select on public.euka_ad_video_day to authenticated;
grant select on public.euka_ad_sync_days to authenticated;
grant all privileges on table public.euka_ad_video_day to service_role;
grant all privileges on table public.euka_ad_sync_days to service_role;

-- ------------------------------------------------------------------ writer --
-- The day twin of `euka_ad_replace_unit`. Delete-then-insert rather than
-- upsert, for the same reason as the month version: a video that stopped
-- spending must LOSE its row, and an upsert would leave yesterday's figure
-- standing for ever.
create or replace function public.euka_ad_replace_day(
  p_advertiser_id text,
  p_campaign_id text,
  p_day date,
  p_store_id text,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.euka_ad_video_day
  where advertiser_id = p_advertiser_id
    and campaign_id = p_campaign_id
    and day = p_day;

  insert into public.euka_ad_video_day (
    item_id, day, store_id, advertiser_id, campaign_id,
    cost, orders, gross_revenue, currency, synced_at
  )
  select r.item_id, p_day, p_store_id, p_advertiser_id, p_campaign_id,
         coalesce(r.cost, 0), coalesce(r.orders, 0), coalesce(r.gross_revenue, 0),
         r.currency, now()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
       as r(item_id text, cost numeric, orders integer, gross_revenue numeric, currency text);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.euka_ad_replace_day(text, text, date, text, jsonb) from public, anon;
grant execute on function public.euka_ad_replace_day(text, text, date, text, jsonb) to service_role;

-- ------------------------------------------------------------------- claim --
-- The day twin of `euka_ad_claim_units`, with the same ordering and the same
-- reasoning behind it: never-fetched days first so a backfill cannot be starved
-- by a campaign that keeps timing out, then retries oldest-due first.
--
-- `c.day desc` after that, so the backfill walks BACKWARDS from today. The
-- recent end is what "last 7 days" needs, so it should become exact first;
-- ninety days ago can wait.
create or replace function public.euka_ad_claim_days(p_limit integer)
returns setof public.euka_ad_sync_days
language sql
security invoker
set search_path = ''
as $$
  update public.euka_ad_sync_days u
  set due_at = now() + interval '10 minutes',
      updated_at = now()
  where (u.advertiser_id, u.campaign_id, u.day) in (
    select c.advertiser_id, c.campaign_id, c.day
    from public.euka_ad_sync_days c
    where c.due_at <= now()
    order by (c.status = 'pending') desc, c.due_at, c.day desc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning u.*;
$$;

revoke all on function public.euka_ad_claim_days(integer) from public, anon, authenticated;
grant execute on function public.euka_ad_claim_days(integer) to service_role;

-- ----------------------------------------------------------------- coverage --
-- The first day we hold day-grain figures for. Everything from here onwards can
-- be answered exactly; anything earlier has to fall back to months.
--
-- It reads the UNITS rather than the figures, deliberately: a day where nothing
-- was spent writes no figure rows at all, and judging coverage by the figures
-- would treat a genuinely empty day as a hole and silently drop the whole
-- range back to month grain.
create or replace function public.euka_ad_day_floor()
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select min(day) from public.euka_ad_sync_days where status = 'ok';
$$;

revoke all on function public.euka_ad_day_floor() from public, anon;
grant execute on function public.euka_ad_day_floor() to authenticated, service_role;

-- ------------------------------------------------------------------ readers --
-- Same signature and same shape as before, so `collab-ad-math.ts` and every
-- caller are untouched. What changes is that a range inside the day-grain
-- window is now answered from days and is therefore exact.
--
-- ONE GRAIN PER ANSWER, NEVER BOTH. A month row already contains its days, so
-- summing both would count the same spend twice. The rule is deliberately
-- blunt: if the whole requested window sits inside the day-grain coverage, use
-- days; otherwise use months exactly as before. A partly covered range answers
-- from months, which is the OLD behaviour and therefore no worse than today —
-- it is wide rather than wrong, and it stops being wide on its own as the
-- backfill walks further back.
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
  v_floor date;
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

  v_floor := public.euka_ad_day_floor();
  -- An unbounded start means "all time", which reaches back past any backfill,
  -- so only a bounded range that begins inside the covered window qualifies.
  v_use_days := v_floor is not null and p_from is not null and p_from >= v_floor;

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
        and (p_to is null or d.day <= p_to)
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
        -- Month grain: a month counts when it overlaps the range.
        and (p_from is null or m.month >= date_trunc('month', p_from)::date)
        and (p_to is null or m.month <= p_to)
      group by m.item_id;
  end if;
end;
$$;

revoke all on function public.euka_ad_totals_for_videos(text[], date, date) from public, anon;
grant execute on function public.euka_ad_totals_for_videos(text[], date, date) to authenticated, service_role;

-- ------------------------------------------------------------- what we have --
-- So a screen can say "exact from 15 Jul" rather than quietly being wide, and
-- so the backfill's progress is visible without reading the queue.
create or replace function public.euka_ad_day_coverage()
returns table (day_floor date, days_ok bigint, days_pending bigint, days_failed bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    public.euka_ad_day_floor(),
    count(*) filter (where status = 'ok'),
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'failed')
  from public.euka_ad_sync_days;
$$;

revoke all on function public.euka_ad_day_coverage() from public, anon;
grant execute on function public.euka_ad_day_coverage() to authenticated, service_role;
