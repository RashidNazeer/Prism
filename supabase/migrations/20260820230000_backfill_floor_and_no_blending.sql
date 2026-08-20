-- ============================================================================
-- TWO SMALL THINGS THE AUDIT FOUND THAT ARE CHEAP AND SHARP. 2026-08-20
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A video that never earns must not pin the backfill open for ever.
-- ----------------------------------------------------------------------------
/*
 * `tiktok_days_to_backfill` works the sync's depth out from videos that have NO
 * figures at all, so a late-added video pulls its own history in. That is the
 * behaviour Rashid asked for and it stays.
 *
 * WHAT IT DID NOT HAVE IS AN END. A video that simply never runs ads — a link
 * that was approved and then never boosted, or a post that was taken down — has
 * no figures for ever, so it sets the depth for ever. Every night, the job asks
 * for as many days as that one video is old. With one brand that is waste. With
 * several brands sharing a call ceiling it is worse than waste: one stuck video
 * on one brand spends the night's budget and the other brands sync nothing.
 *
 * NINETY-FIVE DAYS. Long enough that a genuinely late link still fills in
 * (Rashid's real case was nineteen days, and a month-late upload is plausible),
 * short enough that a dead video stops costing money in the same quarter. After
 * that the depth settles back to the ordinary short window and the video simply
 * reports nothing, which is the truth about it.
 */
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
    and coalesce(public.tiktok_posted_at(v.embed_id), v.created_at) > now() - interval '95 days'
    and not exists (
      select 1 from public.tiktok_video_daily d where d.item_id = v.embed_id
    );
$$;

comment on function public.tiktok_days_to_backfill() is
  'How far back the nightly sync must reach, worked out from approved videos that have no figures at all. Capped at 95 days since 2026-08-20: a video that has had three months to earn and has not is never going to, and letting it set the depth for ever spends every other brand''s share of the call ceiling.';

revoke all on function public.tiktok_days_to_backfill() from anon, authenticated, public;
grant execute on function public.tiktok_days_to_backfill() to service_role;


-- ----------------------------------------------------------------------------
-- 2. Never blend two currencies into one number.
-- ----------------------------------------------------------------------------
/*
 * Rashid confirmed with his boss on 2026-08-20 that the product is USD ONLY, so
 * there is no FX table here and no conversion: that would be building for a
 * case the business has decided against.
 *
 * BUT THE READS MUST NOT ASSUME IT. They used `max(currency)`, which picks one
 * label off a set and prints it over a sum of everything — so the day a single
 * GBP ad account is connected, a creator's GMV becomes dollars plus pounds with
 * a dollar sign on it, and nothing anywhere says a word. That is a business
 * decision turning into a silent money bug, which is the exact shape this
 * product cannot afford.
 *
 * So a sum spanning more than one currency reports its currency as NULL. The
 * screens already treat a null currency as "no symbol", so the figure renders
 * bare rather than wrong, and it is visible immediately rather than in a
 * complaint. It costs nothing while the answer is USD.
 */
create or replace function private.leaderboard_totals(p_from date, p_to date)
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

revoke all on function private.leaderboard_totals(date, date) from public, anon, authenticated;

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
    case when count(distinct d.currency) = 1 then min(d.currency) end as currency
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

revoke all on function public.creator_daily_performance(date, date, text) from anon;
grant execute on function public.creator_daily_performance(date, date, text)
  to authenticated, service_role;

create or replace function public.creator_brand_performance(p_from date, p_to date)
returns table (
  brand_id uuid,
  brand_name text,
  gmv numeric,
  spend numeric,
  orders bigint,
  videos integer,
  roi numeric,
  currency text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select distinct v.embed_id
    from public.creator_videos v
    where v.creator_id = (select auth.uid())
      and v.embed_id is not null
      and v.status = 'approved'
  )
  select
    d.brand_id,
    b.name                                as brand_name,
    sum(d.gross_revenue)                  as gmv,
    sum(d.cost)                           as spend,
    sum(d.orders)                         as orders,
    count(distinct d.item_id)::integer    as videos,
    round(sum(d.gross_revenue) / nullif(sum(d.cost), 0), 2) as roi,
    case when count(distinct d.currency) = 1 then min(d.currency) end as currency
  from public.tiktok_video_daily d
  join mine m on m.embed_id = d.item_id
  left join public.brands b on b.id = d.brand_id
  where d.stat_date between p_from and p_to
  group by d.brand_id, b.name
  order by sum(d.gross_revenue) desc nulls last;
$$;

revoke all on function public.creator_brand_performance(date, date) from anon;
grant execute on function public.creator_brand_performance(date, date)
  to authenticated, service_role;
