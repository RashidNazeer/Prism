-- ============================================================================
-- ONE PIPELINE FOR EVERY VIDEO A CREATOR MAKES FOR US, 2026-08-20
--
-- Rashid, walking the flow: "we are receiving videos from user from 2 channels
-- that is offers and contest. We usually run ads on all videos of contest and
-- offers as well so like offer videos, when admin approves contest videos only
-- then creators should be able to see the stats of contest videos such as gmv
-- ad spend etc in my numbers section."
--
-- Until now the ad pipeline knew about ONE of those channels. Every part of it
-- named `content_submissions`, which is the OFFER table. A contest video's item
-- id was never sent to TikTok, never landed in `tiktok_video_daily`, and could
-- not have been read if it had: the row policy asks the offer table who owns a
-- video. So My Numbers was silently "offer videos only", with nothing on the
-- screen saying so.
--
-- FOUR PLACES HAD TO CHANGE TOGETHER, and they are the same four the approval
-- gate touched on 2026-08-19, for the same reason: the row policy, the three
-- read functions, the backfill depth, and the sync's own query. Widening three
-- of four leaves a video that is fetched and unreadable, or readable and never
-- fetched.
--
--
-- THE DEDUPLICATION IS THE SUBTLE PART, and it is why this is not a plain
-- UNION ALL everywhere.
--
-- There is no uniqueness on `embed_id` anywhere: not across creators, not
-- within one. `content_submissions` is unique on (application_id, video_url)
-- and `contest_submissions` on (entry_id, video_url), so one creator can
-- legitimately file the SAME video against a job and against a contest entry.
-- That is not an error — it is one video that did two things — but summing the
-- money twice for it is.
--
-- So `creator_video_performance` collapses to one row per (creator, item) and
-- reports `source` as 'offer', 'contest', or 'both'. The three tabs on My
-- Numbers filter that column, which means a video that did both appears under
-- Offers AND under Contests, once each, and under All exactly once. Each tab's
-- total is right on its own; adding the two tabs together is the one sum this
-- data cannot support, and no screen does it.
--
--
-- AND CONTEST VIDEOS FINALLY CARRY AN ID. `contest_submissions.embed_id` has
-- existed since 2026-08-13 and was NULL on every row, because the creator's
-- dialog sends only a link and an ad code while the Edge Function and the RPC
-- both accept an id nobody was passing. Without it a contest video cannot be
-- matched to a TikTok report row at all. The backfill at the end of this file
-- reads the id out of the link, which is exact: a TikTok URL carries it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Every video, from either channel, in one place.
-- ----------------------------------------------------------------------------
/*
 * SECURITY_INVOKER IS NOT OPTIONAL, exactly as on `job_progress`. A view runs
 * as its OWNER by default, which would bypass row security on both tables
 * underneath and handt every creator every other creator's videos. With
 * security_invoker the policies on `content_submissions` and
 * `contest_submissions` still decide, so this view is a convenience and never a
 * privilege.
 */
create or replace view public.creator_videos
with (security_invoker = true) as
select
  cs.id            as submission_id,
  'offer'::text    as source,
  cs.creator_id,
  cs.brand_id,
  cs.embed_id,
  cs.video_url,
  cs.video_title,
  cs.thumbnail_url,
  cs.status,
  cs.ad_authorized,
  cs.created_at
from public.content_submissions cs
union all
select
  s.id             as submission_id,
  'contest'::text  as source,
  s.creator_id,
  s.brand_id,
  s.embed_id,
  s.video_url,
  s.video_title,
  s.thumbnail_url,
  s.status,
  s.ad_authorized,
  s.created_at
from public.contest_submissions s;

comment on view public.creator_videos is
  'Every video a creator has filed, from both channels: offers (content_submissions) and contests (contest_submissions). security_invoker, so the tables underneath still decide who sees what. One row per SUBMISSION, so the same video filed against a job and a contest appears twice; anything summing money must collapse on embed_id first.';

grant select on public.creator_videos to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. The row policy. Both channels, still approved-only.
-- ----------------------------------------------------------------------------
/*
 * WRITTEN AS TWO EXPLICIT `exists` RATHER THAN AGAINST THE VIEW. A policy is
 * the floor every other query stands on and it should be readable without
 * chasing a definition somewhere else, especially one that could be widened by
 * a later migration without anybody noticing this depended on it.
 *
 * `status = 'approved'` on both halves, carried over from 2026-08-19: a link is
 * a claim until somebody has watched it, and until then its money is not theirs
 * to read. That rule now covers contest videos too, which is the whole reason
 * `review_contest_content` had to become reachable first.
 */
drop policy if exists "tiktok_video_daily_select_own" on public.tiktok_video_daily;

create policy "tiktok_video_daily_select_own"
  on public.tiktok_video_daily
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.content_submissions cs
      where cs.embed_id = tiktok_video_daily.item_id
        and cs.creator_id = (select auth.uid())
        and cs.status = 'approved'
    )
    or exists (
      select 1
      from public.contest_submissions s
      where s.embed_id = tiktok_video_daily.item_id
        and s.creator_id = (select auth.uid())
        and s.status = 'approved'
    )
  );

comment on policy "tiktok_video_daily_select_own" on public.tiktok_video_daily is
  'A creator reads the figures for their own APPROVED videos, from either channel, and nothing else. Ownership alone is not enough and never was.';


-- ----------------------------------------------------------------------------
-- 3. The window, and the backfill depth.
-- ----------------------------------------------------------------------------

create or replace function public.creator_performance_window()
returns table (
  earliest date,
  latest date,
  videos integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    min(coalesce(public.tiktok_posted_at(v.embed_id), v.created_at))::date as earliest,
    max(d.stat_date)                                                       as latest,
    count(distinct v.embed_id)::integer                                    as videos
  from public.creator_videos v
  left join public.tiktok_video_daily d on d.item_id = v.embed_id
  where v.creator_id = (select auth.uid())
    and v.embed_id is not null
    and v.status = 'approved';
$$;

create or replace function public.tiktok_days_to_backfill()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    max(
      extract(day from (now() - coalesce(public.tiktok_posted_at(v.embed_id), v.created_at)))::integer
    ),
    0
  )
  from public.creator_videos v
  join public.tiktok_stores s
    on s.brand_id = v.brand_id and s.brand_id is not null
  where v.embed_id is not null
    and v.ad_authorized
    and v.status = 'approved'
    and not exists (
      select 1 from public.tiktok_video_daily d where d.item_id = v.embed_id
    );
$$;


-- ----------------------------------------------------------------------------
-- 4. The chart. One row per day, both channels.
-- ----------------------------------------------------------------------------
/*
 * A `p_source` filter, so the three tabs on My Numbers each get their own
 * series rather than the screen slicing one in the browser. NULL means every
 * video, which is what the All tab asks for.
 *
 * It aggregates `tiktok_video_daily` directly and matches on item id, so a
 * video filed twice contributes its day ONCE however many submissions point at
 * it. That is why this function has never double counted and the tiles above it
 * used to.
 */
create or replace function public.creator_daily_performance(
  p_from date,
  p_to date,
  p_source text default null
)
returns table (
  stat_date date,
  cost numeric,
  gross_revenue numeric,
  orders bigint,
  videos integer,
  currency text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.stat_date,
    sum(d.cost)                        as cost,
    sum(d.gross_revenue)               as gross_revenue,
    sum(d.orders)                      as orders,
    count(distinct d.item_id)::integer as videos,
    max(d.currency)                    as currency
  from public.tiktok_video_daily d
  where d.stat_date between p_from and p_to
    and exists (
      select 1
      from public.creator_videos v
      where v.embed_id = d.item_id
        and v.creator_id = (select auth.uid())
        and v.status = 'approved'
        and (p_source is null or v.source = p_source)
    )
  group by d.stat_date
  order by d.stat_date;
$$;


-- ----------------------------------------------------------------------------
-- 5. The cards. One row per VIDEO, carrying which channel it came from.
-- ----------------------------------------------------------------------------
/*
 * `create or replace` cannot add a column to a function's return type, so this
 * one is dropped and recreated. Atomic inside the migration: no request can
 * arrive in the gap.
 *
 * `source` is 'offer', 'contest' or 'both'. The collapse happens in `mine`, on
 * (creator, embed_id), which is the only place in the product that has ever
 * been able to see one video wearing two hats.
 */
drop function if exists public.creator_video_performance(date, date);

create function public.creator_video_performance(
  p_from date,
  p_to date,
  p_source text default null
)
returns table (
  item_id text,
  submission_id uuid,
  source text,
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
  ads_ever boolean,
  last_active_date date,
  lifetime_cost numeric,
  lifetime_revenue numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select
      v.embed_id,
      -- The earliest filing is the one whose date the card shows, and whose
      -- id and link it carries. Two submissions of one video are one video.
      (array_agg(v.submission_id order by v.created_at))[1]  as submission_id,
      (array_agg(v.video_url order by v.created_at))[1]      as video_url,
      (array_agg(v.video_title order by v.created_at))[1]    as video_title,
      (array_agg(v.thumbnail_url order by v.created_at))[1]  as thumbnail_url,
      (array_agg(v.brand_id order by v.created_at))[1]       as brand_id,
      min(v.created_at)                                      as created_at,
      case
        when count(distinct v.source) > 1 then 'both'
        else min(v.source)
      end                                                    as source
    from public.creator_videos v
    where v.creator_id = (select auth.uid())
      and v.embed_id is not null
      and v.status = 'approved'
    group by v.embed_id
  ),
  scoped as (
    select * from mine
    -- 'both' answers to either tab, because it genuinely is both. Adding the
    -- two tabs together is the one sum this data cannot support, and nothing
    -- does it.
    where p_source is null or source = p_source or source = 'both'
  ),
  lifetime as (
    select d.item_id,
           sum(d.cost)          as cost,
           sum(d.gross_revenue) as revenue,
           max(d.stat_date) filter (where d.cost > 0) as last_active,
           bool_or(d.cost > 0)  as ads_ever
    from public.tiktok_video_daily d
    where d.item_id in (select embed_id from scoped)
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
    where d.item_id in (select embed_id from scoped)
      and d.stat_date between p_from and p_to
    group by d.item_id
  )
  select
    m.embed_id                                as item_id,
    m.submission_id,
    m.source,
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
  from scoped m
  left join public.brands b on b.id = m.brand_id
  left join lifetime l on l.item_id = m.embed_id
  left join ranged   r on r.item_id = m.embed_id
  order by coalesce(r.revenue, 0) desc, m.created_at desc;
$$;

revoke all on function public.creator_video_performance(date, date, text) from anon;
revoke all on function public.creator_daily_performance(date, date, text) from anon;
revoke all on function public.creator_performance_window() from anon;

grant execute on function public.creator_video_performance(date, date, text) to authenticated;
grant execute on function public.creator_daily_performance(date, date, text) to authenticated;
grant execute on function public.creator_performance_window() to authenticated;

revoke all on function public.tiktok_days_to_backfill() from anon, authenticated, public;
grant execute on function public.tiktok_days_to_backfill() to service_role;


-- ----------------------------------------------------------------------------
-- 6. Give every contest video its TikTok id.
-- ----------------------------------------------------------------------------
/*
 * READ OUT OF THE LINK, not fetched. A TikTok URL carries the id in its path,
 * so this is exact and costs nothing, where oEmbed is rate limited and returns
 * nothing at all for a post that has since been deleted. `manage-content` uses
 * oEmbed because it wants the thumbnail and title as well; here the id is the
 * only thing that matters, and the id is the only thing money is matched on.
 *
 * The pattern is the same one `videoIdFrom` uses in the browser, and the same
 * length bound `tiktok_stores.store_id` uses, so an id that does not look like
 * an id stays null rather than becoming a filter that matches nothing.
 */
update public.contest_submissions
set embed_id = substring(video_url from '/video/([0-9]{6,32})')
where embed_id is null
  and video_url ~ '/video/[0-9]{6,32}';

comment on column public.contest_submissions.embed_id is
  'The TikTok item id, which is what ad money is matched on. Derived from the link server side; a link that carries no id leaves this null and that video simply reports no figures.';

create index if not exists contest_submissions_embed_idx
  on public.contest_submissions (embed_id)
  where embed_id is not null;
