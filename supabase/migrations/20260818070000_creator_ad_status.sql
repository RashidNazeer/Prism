-- ============================================================================
-- Is GMV Max actually running on this video?
--
-- Rashid, 2026-08-18: "it's not important that on each video we are running gmv
-- max so we can show users that whether we are running gmv max or not on their
-- which video". He is right, and it matters more than it sounds: without it, a
-- card with no numbers is ambiguous. A creator cannot tell "we never ran ads on
-- this one" from "the data has not arrived yet", and the second reading is the
-- one that erodes trust in every other figure on the screen.
--
-- SO THE AD STATUS IS ALL-TIME, NOT RANGE-SCOPED, and that is deliberate.
-- "Are we running ads on my video" is a fact about the video. Answering it from
-- whatever seven days happen to be selected would flip the badge as somebody
-- changed a filter, which is the opposite of an answer.
--
-- The MONEY stays range-scoped, because that genuinely is a question about a
-- period. So each card carries both: what it made in the range you chose, and
-- whether ads are running on it at all.
-- ============================================================================

-- `create or replace` cannot change a function's return columns, and this adds
-- four, so the old one has to go first. Dropping and recreating in one
-- migration is atomic: no request can arrive in the gap.
drop function if exists public.creator_video_performance(date, date);

create function public.creator_video_performance(p_from date, p_to date)
returns table (
  item_id text,
  submission_id uuid,
  video_url text,
  video_title text,
  thumbnail_url text,
  brand_id uuid,
  brand_name text,
  submitted_at timestamptz,
  cost numeric,
  gross_revenue numeric,
  orders bigint,
  roi numeric,
  cost_per_order numeric,
  currency text,
  days_with_data integer,
  -- Has any spend ever landed on this video, over all time.
  ads_ever boolean,
  -- The most recent day it actually spent. The screen calls anything within a
  -- few days of the latest data "running now", and older than that "ran".
  last_active_date date,
  -- Lifetime, so a card can say what a video has made in total even while the
  -- range above it shows a week.
  lifetime_cost numeric,
  lifetime_revenue numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select cs.id, cs.embed_id, cs.video_url, cs.video_title, cs.thumbnail_url,
           cs.brand_id, cs.created_at
    from public.content_submissions cs
    where cs.creator_id = (select auth.uid())
      and cs.embed_id is not null
  ),
  -- All time, for the ad status. Separate from the range aggregate below on
  -- purpose: see the note at the top of this file.
  lifetime as (
    select d.item_id,
           sum(d.cost)          as cost,
           sum(d.gross_revenue) as revenue,
           max(d.stat_date) filter (where d.cost > 0) as last_active,
           bool_or(d.cost > 0)  as ads_ever
    from public.tiktok_video_daily d
    where d.item_id in (select embed_id from mine)
    group by d.item_id
  ),
  ranged as (
    select d.item_id,
           sum(d.cost)          as cost,
           sum(d.gross_revenue) as revenue,
           sum(d.orders)        as orders,
           max(d.currency)      as currency,
           count(*)::integer    as days
    from public.tiktok_video_daily d
    where d.item_id in (select embed_id from mine)
      and d.stat_date between p_from and p_to
    group by d.item_id
  )
  select
    m.embed_id                                as item_id,
    m.id                                      as submission_id,
    m.video_url,
    m.video_title,
    m.thumbnail_url,
    m.brand_id,
    b.name                                    as brand_name,
    m.created_at                              as submitted_at,
    coalesce(r.cost, 0)                       as cost,
    coalesce(r.revenue, 0)                    as gross_revenue,
    coalesce(r.orders, 0)                     as orders,
    round(coalesce(r.revenue, 0) / nullif(r.cost, 0), 2)  as roi,
    round(coalesce(r.cost, 0) / nullif(r.orders, 0), 2)   as cost_per_order,
    r.currency,
    coalesce(r.days, 0)                       as days_with_data,
    coalesce(l.ads_ever, false)               as ads_ever,
    l.last_active                             as last_active_date,
    coalesce(l.cost, 0)                       as lifetime_cost,
    coalesce(l.revenue, 0)                    as lifetime_revenue
  from mine m
  left join public.brands b on b.id = m.brand_id
  left join lifetime l on l.item_id = m.embed_id
  left join ranged   r on r.item_id = m.embed_id
  order by coalesce(r.revenue, 0) desc, m.created_at desc;
$$;

revoke all on function public.creator_video_performance(date, date) from anon;
grant execute on function public.creator_video_performance(date, date) to authenticated;
