-- ============================================================================
-- The numbers behind a creator's videos.
--
-- THE SHAPE OF THIS IS THE SECURITY DESIGN, so it is worth saying plainly.
--
-- Creators never reach TikTok. Not rate limited, not quota'd: they cannot do it
-- at all. A scheduled job pulls each complete day once, writes it here, and
-- every creator screen reads this table and nothing else. That is why a date
-- filter can be free and unlimited, which is a better answer than rationing it:
-- there is no call to ration.
--
-- ONE ROW PER VIDEO PER DAY, and a complete day never changes, so a row is
-- fetched once and correct forever. Today is deliberately NOT stored: it is
-- still accruing and would be wrong within the hour.
--
-- WHY THE KEY IS (item_id, stat_date) AND NOT (advertiser_id, item_id,
-- stat_date). A video runs its ads under exactly one ad account, so only one
-- advertiser can ever report real figures for it. Keying on the pair would
-- invite a second, empty row for the same video from another account that
-- happens to see the same store, and summing a range would then double count
-- money. `advertiser_id` is kept as provenance, not as identity.
-- ============================================================================

create table public.tiktok_video_daily (
  -- TikTok's item_id, which is what `content_submissions.embed_id` already
  -- holds. No new column and no parsing: the join was built in August.
  item_id text not null check (item_id ~ '^[0-9]{6,32}$'),

  -- The day, in the AD ACCOUNT'S timezone, because that is the only day
  -- boundary TikTok knows. Ours is Etc/GMT+5. A figure filed under our date
  -- would be a different day's money.
  stat_date date not null,

  advertiser_id text not null
    references public.tiktok_ad_accounts (advertiser_id) on delete cascade,

  -- What we spent running ads on this video.
  cost numeric(14, 2) not null default 0,
  -- What it sold.
  gross_revenue numeric(14, 2) not null default 0,
  orders integer not null default 0,

  -- TikTok returns this without being asked, and every figure is denominated in
  -- it. Stored per row rather than looked up, so a historic number cannot be
  -- silently redenominated by an account changing its currency later.
  currency text,

  fetched_at timestamptz not null default now(),

  primary key (item_id, stat_date)
);

comment on table public.tiktok_video_daily is
  'One row per video per complete day, written only by the scheduled sync. Creators read this and never call TikTok. Today is never stored: it is still accruing.';

create index tiktok_video_daily_date_idx on public.tiktok_video_daily (stat_date);
create index tiktok_video_daily_advertiser_idx
  on public.tiktok_video_daily (advertiser_id, stat_date);

/*
 * ROI AND COST PER ORDER ARE NOT STORED, ON PURPOSE.
 *
 * They are ratios, and a ratio cannot be summed. Storing a daily ROI would
 * invite somebody to average thirty of them across a month, which is simply a
 * different and wrong number. Revenue over cost, computed at the moment of
 * display over whatever range is being shown, is the only version that is
 * right at every zoom level. Verified against the live API: 94.75 / 223.47 =
 * 0.42, exactly what TikTok reports for that range.
 */

-- ---------------------------------------------------------- the sync ledger --

create table public.tiktok_sync_runs (
  id uuid primary key default gen_random_uuid(),
  advertiser_id text,
  store_id text,
  stat_date date,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  videos_asked integer,
  rows_written integer,
  error text,
  -- 'cron' or 'admin', so a manual backfill is distinguishable from the
  -- nightly job when reading the history back.
  trigger text not null default 'cron'
);

comment on table public.tiktok_sync_runs is
  'Every attempt to pull a day from TikTok. This is how the job knows which days it already has, so a restart never refetches work it has done.';

create index tiktok_sync_runs_lookup_idx
  on public.tiktok_sync_runs (advertiser_id, stat_date, finished_at desc);

-- The RLS join below looks videos up by embed_id, so it needs an index or every
-- creator page scans the whole content table.
create index if not exists content_submissions_embed_creator_idx
  on public.content_submissions (embed_id, creator_id)
  where embed_id is not null;

-- ============================================================================
-- Row security
-- ============================================================================

alter table public.tiktok_video_daily enable row level security;
alter table public.tiktok_sync_runs   enable row level security;

/*
 * A CREATOR SEES THE NUMBERS FOR THEIR OWN VIDEOS AND NOBODY ELSE'S, and this
 * policy is where that is true. Not the screen, not the edge function: here.
 *
 * Ownership is `content_submissions.creator_id`, which is set from the session
 * when a video is submitted and is never accepted from a browser. So a creator
 * asking for a video id they do not own gets no row, whatever the client sends.
 */
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
    )
  );

-- Staff see everything, so the admin side can answer "is this working".
create policy "tiktok_video_daily_select_staff"
  on public.tiktok_video_daily
  for select
  to authenticated
  using (public.is_staff());

create policy "tiktok_sync_runs_select_staff"
  on public.tiktok_sync_runs
  for select
  to authenticated
  using (public.is_staff());

/*
 * NO INSERT, UPDATE OR DELETE POLICY ON EITHER, deliberately. These tables are
 * written by the scheduled sync running as the service role and by nothing
 * else. A creator being able to write their own ad spend is the whole ballgame.
 */

revoke all on table public.tiktok_video_daily from anon, authenticated;
revoke all on table public.tiktok_sync_runs   from anon, authenticated;

grant select on table public.tiktok_video_daily to authenticated;
grant select on table public.tiktok_sync_runs   to authenticated;

grant all privileges on table public.tiktok_video_daily to service_role;
grant all privileges on table public.tiktok_sync_runs   to service_role;

-- ============================================================================
-- What a creator's screen reads. Aggregated in SQL, never in the browser.
--
-- All three are SECURITY INVOKER, so the policy above is what decides the rows
-- rather than a WHERE clause somebody could forget to write. They take a date
-- range and nothing else: there is no video id parameter anywhere, because a
-- client that cannot name a video cannot ask for somebody else's.
-- ============================================================================

/**
 * The earliest and latest day this creator could sensibly look at.
 *
 * The floor is the day their first video was submitted. Rashid's rule: do not
 * let them pick a date before the video existed, because an empty month reads
 * as "you earned nothing" rather than "there was nothing yet".
 */
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
    min(cs.created_at)::date as earliest,
    max(d.stat_date)         as latest,
    count(distinct cs.embed_id)::integer as videos
  from public.content_submissions cs
  left join public.tiktok_video_daily d on d.item_id = cs.embed_id
  where cs.creator_id = (select auth.uid())
    and cs.embed_id is not null;
$$;

/**
 * One row per video, totalled over the range. This is the My content tab.
 *
 * ROI is computed here rather than stored, and `nullif` is what stops a video
 * with no spend dividing by zero and reporting infinity as a return.
 */
create or replace function public.creator_video_performance(p_from date, p_to date)
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
  days_with_data integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    cs.embed_id                                   as item_id,
    cs.id                                         as submission_id,
    cs.video_url,
    cs.video_title,
    cs.thumbnail_url,
    cs.brand_id,
    b.name                                        as brand_name,
    cs.created_at                                 as submitted_at,
    coalesce(sum(d.cost), 0)                      as cost,
    coalesce(sum(d.gross_revenue), 0)             as gross_revenue,
    coalesce(sum(d.orders), 0)                    as orders,
    round(coalesce(sum(d.gross_revenue), 0) / nullif(sum(d.cost), 0), 2) as roi,
    round(coalesce(sum(d.cost), 0) / nullif(sum(d.orders), 0), 2)        as cost_per_order,
    max(d.currency)                               as currency,
    count(d.stat_date)::integer                   as days_with_data
  from public.content_submissions cs
  left join public.brands b on b.id = cs.brand_id
  left join public.tiktok_video_daily d
    on d.item_id = cs.embed_id
   and d.stat_date between p_from and p_to
  where cs.creator_id = (select auth.uid())
    and cs.embed_id is not null
  group by cs.embed_id, cs.id, cs.video_url, cs.video_title, cs.thumbnail_url,
           cs.brand_id, b.name, cs.created_at
  order by coalesce(sum(d.gross_revenue), 0) desc, cs.created_at desc;
$$;

/**
 * One row per day, totalled across every video. This is the Dashboard.
 *
 * Days with no data are absent rather than zero: a gap in a chart is honest,
 * whereas a zero says the ads ran and sold nothing.
 */
create or replace function public.creator_daily_performance(p_from date, p_to date)
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
    sum(d.cost)                     as cost,
    sum(d.gross_revenue)            as gross_revenue,
    sum(d.orders)                   as orders,
    count(distinct d.item_id)::integer as videos,
    max(d.currency)                 as currency
  from public.tiktok_video_daily d
  where d.stat_date between p_from and p_to
    and exists (
      select 1 from public.content_submissions cs
      where cs.embed_id = d.item_id
        and cs.creator_id = (select auth.uid())
    )
  group by d.stat_date
  order by d.stat_date;
$$;

revoke all on function public.creator_performance_window() from anon;
revoke all on function public.creator_video_performance(date, date) from anon;
revoke all on function public.creator_daily_performance(date, date) from anon;

grant execute on function public.creator_performance_window() to authenticated;
grant execute on function public.creator_video_performance(date, date) to authenticated;
grant execute on function public.creator_daily_performance(date, date) to authenticated;
