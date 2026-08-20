-- ============================================================================
-- A MONEY ROW BELONGS TO AN AD ACCOUNT, 2026-08-20
--
-- Rashid, planning the multi-brand future: "each brand has it's own ad account
-- we need to map only one ad account with one brand only ... we need to get the
-- data of all ad account and sum this is the main logic part be careful."
--
--
-- THE DEFECT. `tiktok_video_daily` was keyed on (item_id, stat_date), with
-- `advertiser_id` as a plain column, and the sync upserts a FULL ROW with
-- `onConflict: 'item_id,stat_date'`. So when a second ad account reports the
-- same video on the same day, the second write does not add to the first. It
-- REPLACES it.
--
-- And it replaces it with something worse than a duplicate. The report call is
-- filtered by item id, and TikTok answers for every id it was given: an account
-- that ran no ads on that video returns a row of ZEROS. So the losing write is
-- usually the real money and the winning write is usually nothing. The creator
-- opens My Numbers and a day they earned $1,240 on reads $0.00.
--
-- It is silent in every direction. `tiktok_sync_runs` records two healthy runs.
-- `rowsWritten` is correct. Reverse the store order the next night and the
-- money reappears, so the chart flickers with no explanation.
--
--
-- THE FIX IS TO MAKE THE KEY MATCH THE GRAIN OF THE DATA. One video, on one
-- day, in one ad account is one fact. Two ad accounts reporting the same video
-- are two facts and both are true. So the key becomes
-- (advertiser_id, item_id, stat_date) and the reads SUM across advertisers.
--
-- The reads need almost no change to do that, which is the sign the key was
-- wrong rather than the queries: `creator_daily_performance` and
-- `private.leaderboard_totals` already `group by` item or day and sum, so extra
-- rows are added rather than fought over. Only `creator_video_performance`,
-- which joined one row per item, has to learn to aggregate first.
--
--
-- BRAND AND STORE GO ONTO THE ROW TOO, and that is the other half of what
-- Rashid asked for: "let creators see that in which brand they got how many
-- money so they can analyse". Until now the only answer to "which brand paid
-- me" was the brand on the SUBMISSION, which is a guess the moment one video is
-- filed for two brands, and which `creator_video_performance` was resolving
-- with `(array_agg(brand_id order by created_at))[1]` — the first filing wins,
-- for no reason. The money row knows exactly which brand's ad account paid,
-- because that is the account it was fetched from.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The columns, then the key.
-- ----------------------------------------------------------------------------

alter table public.tiktok_video_daily
  add column if not exists store_id text,
  add column if not exists brand_id uuid references public.brands (id) on delete set null;

comment on column public.tiktok_video_daily.brand_id is
  'Which brand''s ad account paid for this day. Written by the sync from the store mapping, so it is a fact about where the money came from rather than a guess from whichever offer the video was filed against.';

/*
 * BACKFILL BEFORE RE-KEYING. Every existing row came from the single mapped
 * Penetrex store, and its advertiser is already on the row, so the store and
 * brand are recoverable exactly rather than guessed.
 */
update public.tiktok_video_daily d
set store_id = s.store_id,
    brand_id = s.brand_id
from public.tiktok_stores s
where s.advertiser_id = d.advertiser_id
  and d.store_id is null;

/*
 * THE KEY. `advertiser_id` first, because it is the coarsest thing and because
 * the sync writes a whole account's day at once.
 *
 * `store_id` is deliberately NOT in the key. A store belongs to exactly one
 * advertiser in the row that produced this figure, and the report is made per
 * advertiser, so adding it would widen the key without adding a fact and would
 * make a re-mapped store look like new money.
 */
alter table public.tiktok_video_daily drop constraint tiktok_video_daily_pkey;

alter table public.tiktok_video_daily
  add constraint tiktok_video_daily_pkey primary key (advertiser_id, item_id, stat_date);

comment on table public.tiktok_video_daily is
  'One row per video, per day, per AD ACCOUNT. The advertiser is in the key because two accounts reporting the same video on the same day are two true facts, and the old (item_id, stat_date) key made the second one overwrite the first with zeros. Every read sums across advertisers.';

-- The creator read path matches on item id, so it needs its own index now that
-- the item is no longer the leading column of the key.
create index if not exists tiktok_video_daily_item_idx
  on public.tiktok_video_daily (item_id, stat_date);

-- And the board, which sweeps a date range and sums.
create index if not exists tiktok_video_daily_range_idx
  on public.tiktok_video_daily (stat_date, item_id) include (cost, gross_revenue, orders);

create index if not exists tiktok_video_daily_brand_idx
  on public.tiktok_video_daily (brand_id, stat_date)
  where brand_id is not null;


-- ----------------------------------------------------------------------------
-- 2. The card list, which is the one read that has to learn to add up.
-- ----------------------------------------------------------------------------
/*
 * `lifetime` and `ranged` already `group by d.item_id`, so they sum across
 * advertisers with no change at all. What changes is `days_with_data`: it was
 * `count(*)`, which counted ROWS, and two accounts reporting the same day would
 * have made one day look like two. It counts distinct days now.
 */
create or replace function public.creator_video_performance(
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
           -- the honest answer for a video that two brands both ran.
           (array_agg(d.brand_id order by d.cost desc nulls last))[1] as paid_brand_id
    from public.tiktok_video_daily d
    where d.item_id in (select embed_id from scoped)
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

revoke all on function public.creator_video_performance(date, date, text) from anon;
grant execute on function public.creator_video_performance(date, date, text)
  to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. "Which brand paid me what", which Rashid asked for by name.
-- ----------------------------------------------------------------------------
/*
 * IT READS THE MONEY ROW, NOT THE SUBMISSION. That is the whole point. A
 * submission says which brand a creator FILED a video for; the money row says
 * which brand's ad account actually paid for a day of it. For the ordinary
 * video those agree. For a video two brands both promoted they do not, and only
 * the money row can split it honestly.
 *
 * SECURITY INVOKER, so the row policy on `tiktok_video_daily` decides which
 * rows are visible, exactly as it does for every other creator read. It cannot
 * be asked about another creator because it takes no creator argument at all.
 *
 * A creator sees the brand's NAME and their own figures against it. Nothing
 * about the brand's budget, its other creators, or what anybody else made.
 */
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
    max(d.currency)                       as currency
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

comment on function public.creator_brand_performance(date, date) is
  'What the signed-in creator made, split by the brand whose ad account paid for it. Takes no creator argument, so it cannot be asked about anybody else, and reads through the row policy like every other creator money read. Says nothing about the brand beyond its name.';
