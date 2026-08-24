-- ============================================================================
-- A creator's numbers, narrowed to one brand, for the Brand Hub.
--
-- Rashid: "for my numbers section that we have separately, make sure that here
-- we are calculating my numbers in brand hubs for that particular brand."
--
-- WHICH VIDEOS BELONG TO A BRAND, and it is his answer, not an invention:
-- "offers and contest belong to the brand right. SO when user is adding a video
-- he chooses offer or contest right? so at that time can't we hae a connection
-- that which video is for which brand??"
--
-- Yes. `content_submissions.brand_id` and `contest_submissions.brand_id` are
-- both NOT NULL and both come from the offer or contest the video was filed
-- against, and `creator_videos` carries that through. So the FILING decides
-- which videos a brand's hub lists.
--
-- AND A SECOND RULE THE FILING CANNOT GIVE US. `tiktok_video_daily.brand_id`
-- records which brand's ad account actually PAID for a day of a video. For an
-- ordinary video the two agree. They only disagree when two brands both ran ads
-- on one video, and there the filing is not enough: summing all of a video's
-- money into the brand it was filed under would credit this brand with another
-- brand's spend, which is a lie about somebody's money.
--
-- So both rules apply, and they apply TOGETHER:
--
--     the videos listed  = filed against this brand
--     the money summed   = this brand's money rows, on those videos
--
-- The consequence is deliberate: a video filed for this brand that only another
-- brand ever paid to promote shows here with zero, because this brand spent
-- nothing on it. That is the honest answer, and it keeps the tiles, the chart
-- and the video list all answering the same question, which is the rule the
-- screen's own comment exists to protect.
--
-- WHY EVERY FUNCTION IS DROPPED FIRST, and this is not caution for its own
-- sake. `create or replace function` with a CHANGED argument list does not
-- replace anything: it creates a SECOND OVERLOAD, and PostgREST binds an RPC by
-- the argument NAMES a request sends. This repo has already lost a day to it,
-- on one of these very functions: 20260820180000_drop_old_performance_arity.sql
-- exists because adding `p_source` to `creator_daily_performance` left the old
-- body alive and the screen kept quietly calling it. Every signature below is
-- therefore dropped by its exact current argument list before being recreated.
--
-- NOTHING HERE IS A SECURITY BOUNDARY. The boundary is the row policy on
-- `tiktok_video_daily` plus `auth.uid()`, and it already limits a creator to
-- their own approved videos. A brand argument only narrows what they were
-- already entitled to read, so passing a brand they have never worked with
-- returns nothing rather than somebody else's figures. Every function below
-- stays `security invoker` for exactly that reason: making one `definer` while
-- adding a parameter would replace the policy with a hand-written filter, which
-- is the failure this project has met before.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The window: how far back this creator's data goes, at this brand.
-- ----------------------------------------------------------------------------
/*
 * Without the brand argument, "All time" inside a hub would begin at the
 * creator's first video ANYWHERE, and the "you have no videos yet" empty state
 * would never fire for somebody who has videos at another brand and none here.
 */
drop function if exists public.creator_performance_window();

create or replace function public.creator_performance_window(p_brand_id uuid default null)
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
  left join public.tiktok_video_daily d
    on d.item_id = v.embed_id
   -- The money side of the pair. On the LEFT JOIN, so a video filed here that
   -- this brand has not spent on still counts as a video and simply has no
   -- latest date, rather than vanishing from the count.
   and (p_brand_id is null or d.brand_id = p_brand_id)
  where v.creator_id = (select auth.uid())
    and v.embed_id is not null
    and v.status = 'approved'
    and (p_brand_id is null or v.brand_id = p_brand_id);
$$;

comment on function public.creator_performance_window(uuid) is
  'How far back a creator''s own figures go. With a brand, only videos filed against that brand and only that brand''s money days.';

revoke all on function public.creator_performance_window(uuid) from anon;
grant execute on function public.creator_performance_window(uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. One row per video.
-- ----------------------------------------------------------------------------
/*
 * THE PREDICATE HAS TO GO IN THREE PLACES, and leaving any one of them out is
 * a different wrong screen:
 *
 *   `mine`     decides WHICH VIDEOS EXIST. Without it the function still
 *              returns one row for every video the creator has anywhere, with
 *              the money coalesced to zero, so a brand hub lists other brands'
 *              videos as empty cards and every count on the screen ("Videos
 *              posted", "No ads", the tab count) is the creator's global one.
 *   `ranged`   decides the MONEY IN THE PERIOD: cost, revenue, orders, and so
 *              both halves of every ratio.
 *   `lifetime` decides ADS EVER / LAST ACTIVE / lifetime totals, which drive
 *              the "Ads running" and "Ads finished" states. Without it, a hub
 *              says ads are running when it is another brand running them.
 */
drop function if exists public.creator_video_performance(date, date, text);

create or replace function public.creator_video_performance(
  p_from date,
  p_to date,
  p_source text default null,
  p_brand_id uuid default null
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
      (array_agg(v.submission_id order by v.created_at))[1]  as submission_id,
      (array_agg(v.video_url order by v.created_at))[1]      as video_url,
      (array_agg(v.video_title order by v.created_at))[1]    as video_title,
      (array_agg(v.thumbnail_url order by v.created_at))[1]  as thumbnail_url,
      (array_agg(v.brand_id order by v.created_at))[1]       as filed_brand_id,
      min(v.created_at)                                      as created_at,
      case
        when count(distinct v.source) > 1 then 'both'
        else min(v.source)
      end                                                    as source
    from public.creator_videos v
    where v.creator_id = (select auth.uid())
      and v.embed_id is not null
      and v.status = 'approved'
      -- The filing side: this brand's offers and contests only.
      and (p_brand_id is null or v.brand_id = p_brand_id)
    group by v.embed_id
  ),
  scoped as (
    select * from mine
    where p_source is null or source = p_source or source = 'both'
  ),
  lifetime as (
    select d.item_id,
           sum(d.cost)          as cost,
           sum(d.gross_revenue) as revenue,
           max(d.stat_date) filter (where d.cost > 0) as last_active,
           bool_or(d.cost > 0)  as ads_ever,
           -- WHICH BRAND ACTUALLY PAID, off the money rather than off the
           -- filing. The brand whose ad account spent the most on this video is
           -- the honest answer for a video that two brands both ran. Inside a
           -- hub this can only ever be that brand, because of the predicate
           -- below, and the card then names the brand whose page it is on.
           (array_agg(d.brand_id order by d.cost desc nulls last))[1] as paid_brand_id
    from public.tiktok_video_daily d
    where d.item_id in (select embed_id from scoped)
      and (p_brand_id is null or d.brand_id = p_brand_id)
    group by d.item_id
  ),
  ranged as (
    select d.item_id,
           sum(d.cost)                        as cost,
           sum(d.gross_revenue)               as revenue,
           sum(d.orders)                      as orders,
           max(d.currency)                    as currency,
           count(distinct d.stat_date)::integer as days
    from public.tiktok_video_daily d
    where d.item_id in (select embed_id from scoped)
      and d.stat_date between p_from and p_to
      and (p_brand_id is null or d.brand_id = p_brand_id)
    group by d.item_id
  )
  select
    m.embed_id                                as item_id,
    m.submission_id,
    m.source,
    m.video_url,
    m.video_title,
    m.thumbnail_url,
    coalesce(l.paid_brand_id, m.filed_brand_id) as brand_id,
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
  left join lifetime l on l.item_id = m.embed_id
  left join ranged   r on r.item_id = m.embed_id
  left join public.brands b on b.id = coalesce(l.paid_brand_id, m.filed_brand_id)
  order by coalesce(r.revenue, 0) desc, m.created_at desc;
$$;

comment on function public.creator_video_performance(date, date, text, uuid) is
  'One row per approved video a creator has filed, with its money in the range. With a brand: only videos filed against that brand, and only that brand''s money on them.';

revoke all on function public.creator_video_performance(date, date, text, uuid) from anon;
grant execute on function public.creator_video_performance(date, date, text, uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. One row per day, for the chart.
-- ----------------------------------------------------------------------------
/*
 * Both halves again: `d.brand_id` on the outer where for the money, and
 * `v.brand_id` inside the `exists` for the filing, so the chart is drawn from
 * exactly the set of videos the list below it shows.
 */
drop function if exists public.creator_daily_performance(date, date, text);

create or replace function public.creator_daily_performance(
  p_from date,
  p_to date,
  p_source text default null,
  p_brand_id uuid default null
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
    case when count(distinct d.currency) = 1 then min(d.currency) end as currency
  from public.tiktok_video_daily d
  where d.stat_date between p_from and p_to
    and (p_brand_id is null or d.brand_id = p_brand_id)
    and exists (
      select 1
      from public.creator_videos v
      where v.embed_id = d.item_id
        and v.creator_id = (select auth.uid())
        and v.status = 'approved'
        and (p_source is null or v.source = p_source)
        and (p_brand_id is null or v.brand_id = p_brand_id)
    )
  group by d.stat_date
  order by d.stat_date;
$$;

comment on function public.creator_daily_performance(date, date, text, uuid) is
  'A creator''s own money by day. With a brand, only that brand''s money on videos filed against that brand, so the chart matches the list beneath it.';

revoke all on function public.creator_daily_performance(date, date, text, uuid) from anon;
grant execute on function public.creator_daily_performance(date, date, text, uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. The leaderboard, ranked WITHIN a brand.
-- ----------------------------------------------------------------------------
/*
 * RANK MUST BE COMPUTED INSIDE THE BRAND, NEVER GLOBALLY AND THEN FILTERED.
 * Ranking everybody and then hiding the rows from other brands leaves a board
 * that opens at "#7 of 3", which is not a smaller leaderboard, it is a broken
 * one. The brand predicate therefore goes into `private.leaderboard_totals`,
 * underneath the `rank()`, so the numbering is dense over the brand's own
 * creators and `total_creators` counts that brand's creators.
 *
 * Same pairing as everywhere above: a creator is ON this brand's board because
 * they filed videos against it, and the money that ranks them is this brand's.
 */
drop function if exists public.creator_leaderboard(date, date, integer, integer, text);
drop function if exists public.my_leaderboard_standing(date, date);
drop function if exists private.leaderboard_totals(date, date);

create or replace function private.leaderboard_totals(
  p_from date,
  p_to date,
  p_brand_id uuid default null
)
returns table (
  creator_id uuid,
  gmv numeric,
  spend numeric,
  orders bigint,
  videos integer,
  currency text
)
language sql
stable
security definer
set search_path = ''
as $$
  with owned as (
    select distinct v.creator_id, v.embed_id
    from public.creator_videos v
    where v.embed_id is not null
      and v.status = 'approved'
      and (p_brand_id is null or v.brand_id = p_brand_id)
  ),
  money as (
    select d.item_id,
           sum(d.cost)          as cost,
           sum(d.gross_revenue) as revenue,
           sum(d.orders)        as orders,
           -- Null here already means "this video's days disagree", which
           -- propagates upward exactly as it should.
           case when count(distinct d.currency) = 1 then min(d.currency) end as currency
    from public.tiktok_video_daily d
    where d.stat_date between p_from and p_to
      and (p_brand_id is null or d.brand_id = p_brand_id)
    group by d.item_id
  )
  select
    o.creator_id,
    coalesce(sum(m.revenue), 0)::numeric  as gmv,
    coalesce(sum(m.cost), 0)::numeric     as spend,
    coalesce(sum(m.orders), 0)::bigint    as orders,
    count(*)::integer                     as videos,
    case when count(distinct m.currency) = 1 then min(m.currency) end as currency
  from owned o
  join money m on m.item_id = o.embed_id
  group by o.creator_id;
$$;

revoke all on function private.leaderboard_totals(date, date, uuid)
  from public, anon, authenticated;
grant execute on function private.leaderboard_totals(date, date, uuid) to service_role;

create or replace function public.creator_leaderboard(
  p_from date,
  p_to date,
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default null,
  p_brand_id uuid default null
)
returns table (
  rank bigint,
  creator_id uuid,
  display_name text,
  avatar_path text,
  gmv numeric,
  spend numeric,
  orders bigint,
  videos integer,
  currency text,
  is_me boolean,
  total_creators bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed as (
    select (public.is_approved_creator() or public.is_staff()) as ok
  ),
  ranked as (
    select
      rank() over (order by t.gmv desc)   as rank,
      t.*,
      p.display_name,
      a.path                              as avatar_path,
      count(*) over ()                    as total_creators
    from private.leaderboard_totals(p_from, p_to, p_brand_id) t
    join public.profiles p
      on p.id = t.creator_id
     and p.role = 'creator'
     and p.is_active
    left join public.creator_avatars a on a.profile_id = t.creator_id
    where t.gmv > 0
      and (select ok from allowed)
  )
  select
    r.rank,
    r.creator_id,
    r.display_name,
    r.avatar_path,
    r.gmv,
    r.spend,
    r.orders,
    r.videos,
    r.currency,
    r.creator_id = (select auth.uid()) as is_me,
    r.total_creators
  from ranked r
  where p_search is null
     or trim(p_search) = ''
     or r.display_name ilike '%' || trim(p_search) || '%'
  order by r.rank, r.display_name
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.my_leaderboard_standing(
  p_from date,
  p_to date,
  p_brand_id uuid default null
)
returns table (
  rank bigint,
  gmv numeric,
  spend numeric,
  orders bigint,
  videos integer,
  currency text,
  total_creators bigint,
  top_percent integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed as (
    select (public.is_approved_creator() or public.is_staff()) as ok
  ),
  ranked as (
    select
      rank() over (order by t.gmv desc) as rank,
      t.*,
      count(*) over ()                  as total_creators
    from private.leaderboard_totals(p_from, p_to, p_brand_id) t
    join public.profiles p
      on p.id = t.creator_id and p.role = 'creator' and p.is_active
    where t.gmv > 0
      and (select ok from allowed)
  )
  select
    r.rank,
    r.gmv,
    r.spend,
    r.orders,
    r.videos,
    r.currency,
    r.total_creators,
    greatest(1, ceil((r.rank::numeric / nullif(r.total_creators, 0)) * 100))::integer as top_percent
  from ranked r
  where r.creator_id = (select auth.uid());
$$;

comment on function public.creator_leaderboard(date, date, integer, integer, text, uuid) is
  'The creator leaderboard. With a brand, ranked among that brand''s own creators on that brand''s money, so rank and total_creators are both inside the brand rather than global numbers filtered afterwards.';

revoke all on function public.creator_leaderboard(date, date, integer, integer, text, uuid)
  from public, anon;
revoke all on function public.my_leaderboard_standing(date, date, uuid) from public, anon;
grant execute on function public.creator_leaderboard(date, date, integer, integer, text, uuid)
  to authenticated, service_role;
grant execute on function public.my_leaderboard_standing(date, date, uuid)
  to authenticated, service_role;
