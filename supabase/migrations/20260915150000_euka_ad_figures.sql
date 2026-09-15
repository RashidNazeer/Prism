-- ============================================================================
-- Ad spend, orders and ad GMV per TikTok video, from EUKA, by month. And the
-- spark code Euka holds for each video.
--
-- Rashid, 2026-09-15: for the brands whose TikTok ad account is connected
-- INSIDE Euka, Paid Collabs shows ad spend and ROI per video, summed per
-- creator for the month on screen, plus the spark code. "When euka is giving
-- data we can rely on euka … let's move with euka for now."
--
-- WHY A COPY IN OUR DATABASE AND NOT A LIVE CALL. Measured on dev that day:
--   - Euka's per-campaign item report answers the FIRST request for a window
--     with a 504 after ~45s (TikTok is slow behind it), and the same request a
--     moment later in ~6s.
--   - One month across every connected store took 74 calls and 65 seconds,
--     most campaigns timing out.
--   - The spark-code export is capped at 150 rows a call and takes ~40s.
-- No table can wait for that. `euka-ads-sync` pulls on a schedule and retries;
-- the screen reads these tables in milliseconds.
--
-- MONTH GRAIN, on purpose. The screen only ever asks for a whole month or all
-- time, and one campaign-month is one Euka call. Splitting a window and summing
-- was proven exact the same day (seven single days summed to the same $427.71
-- as the one seven-day call), so the grain can be refined later without any
-- number changing.
--
-- READ BY THE PAID COLLABS TEAM ONLY: staff plus the read-only collabs roles,
-- through `is_collabs_viewer()`. Never creators. Written only by the service
-- role, which is the sync.
-- ============================================================================

-- ------------------------------------------------------------- the figures --
create table public.euka_ad_video_month (
  item_id        text not null check (item_id ~ '^[0-9]{6,32}$'),
  month          date not null check (extract(day from month) = 1),
  store_id       text not null,
  advertiser_id  text not null,
  campaign_id    text not null,
  cost           numeric(14, 2) not null default 0,
  orders         integer not null default 0,
  gross_revenue  numeric(14, 2) not null default 0,
  currency       text,
  synced_at      timestamptz not null default now(),
  -- One video can run in several campaigns and under two ad accounts; each
  -- is its own row, and the reader sums them.
  primary key (item_id, month, advertiser_id, campaign_id)
);
create index euka_ad_video_month_month_idx on public.euka_ad_video_month (month);
create index euka_ad_video_month_unit_idx
  on public.euka_ad_video_month (advertiser_id, campaign_id, month);

comment on table public.euka_ad_video_month is
  'GMV Max ad cost, orders and ad-attributed revenue per TikTok video per campaign per month, copied from EUKA by euka-ads-sync. Only rows where something moved.';

-- ------------------------------------------------------- the work, as units --
-- One unit is one campaign's month. The sync claims due units, fills them, and
-- records exactly what happened, so "no figures" can always be told apart from
-- "not fetched yet" and from "Euka refused".
create table public.euka_ad_sync_units (
  advertiser_id    text not null,
  campaign_id      text not null,
  month            date not null check (extract(day from month) = 1),
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
  primary key (advertiser_id, campaign_id, month)
);
create index euka_ad_sync_units_due_idx on public.euka_ad_sync_units (due_at);

-- Which Euka stores have TikTok Ads connected, as of the last look.
create table public.euka_ad_sync_stores (
  store_id            text primary key,
  store_name          text,
  connected           boolean,
  advertisers         integer,
  campaigns_listed    integer,
  campaigns_reported  integer,
  last_error          text,
  checked_at          timestamptz not null default now()
);

-- --------------------------------------------------------------- spark codes --
create table public.euka_spark_codes (
  item_id      text primary key check (item_id ~ '^[0-9]{6,32}$'),
  store_id     text not null,
  spark_code   text not null,
  expired      boolean,
  expires_at   timestamptz,
  posted_date  date,
  synced_at    timestamptz not null default now()
);

-- One store's day of spark codes is one unit: the export is capped at 150
-- rows a call, so a day is the widest window that has a chance of being whole.
-- `capped` records the days where even that was not enough.
create table public.euka_spark_sync_days (
  store_id    text not null,
  day         date not null,
  status      text not null default 'pending'
              check (status in ('pending', 'ok', 'failed')),
  attempts    integer not null default 0,
  row_count   integer,
  capped      boolean,
  last_error  text,
  synced_at   timestamptz,
  due_at      timestamptz not null default now(),
  primary key (store_id, day)
);
create index euka_spark_sync_days_due_idx on public.euka_spark_sync_days (due_at);

-- ------------------------------------------------------------- row security --
alter table public.euka_ad_video_month  enable row level security;
alter table public.euka_ad_sync_units   enable row level security;
alter table public.euka_ad_sync_stores  enable row level security;
alter table public.euka_spark_codes     enable row level security;
alter table public.euka_spark_sync_days enable row level security;

create policy euka_ad_video_month_select_collabs on public.euka_ad_video_month
  for select to authenticated using (public.is_collabs_viewer());
create policy euka_ad_sync_units_select_collabs on public.euka_ad_sync_units
  for select to authenticated using (public.is_collabs_viewer());
create policy euka_ad_sync_stores_select_collabs on public.euka_ad_sync_stores
  for select to authenticated using (public.is_collabs_viewer());
create policy euka_spark_codes_select_collabs on public.euka_spark_codes
  for select to authenticated using (public.is_collabs_viewer());
create policy euka_spark_sync_days_select_collabs on public.euka_spark_sync_days
  for select to authenticated using (public.is_collabs_viewer());

-- "Automatically expose new tables" is off, which also drops the default
-- grants to service_role. Without these the sync silently reads nothing.
grant select on public.euka_ad_video_month  to authenticated;
grant select on public.euka_ad_sync_units   to authenticated;
grant select on public.euka_ad_sync_stores  to authenticated;
grant select on public.euka_spark_codes     to authenticated;
grant select on public.euka_spark_sync_days to authenticated;
grant all privileges on table public.euka_ad_video_month  to service_role;
grant all privileges on table public.euka_ad_sync_units   to service_role;
grant all privileges on table public.euka_ad_sync_stores  to service_role;
grant all privileges on table public.euka_spark_codes     to service_role;
grant all privileges on table public.euka_spark_sync_days to service_role;

-- ------------------------------------------------------------------ readers --
-- The SAME shape as `ads_totals_for_videos`, so the screen's arithmetic
-- (collab-ad-math.ts) is untouched: one row per video that has figures in the
-- range, absent otherwise. Absent renders as a dash; a zero row would claim
-- "nothing was spent", which is a statement rather than an absence.
--
-- SECURITY INVOKER, so the select policy above decides who sees anything.
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
begin
  if coalesce(array_length(p_item_ids, 1), 0) > 2000 then
    raise exception 'euka_ad_totals_for_videos: at most 2000 videos per call'
      using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'euka_ad_totals_for_videos: the range ends before it starts'
      using errcode = '22023';
  end if;

  return query
    select m.item_id,
           sum(m.cost)::numeric,
           sum(m.gross_revenue)::numeric,
           sum(m.orders)::bigint,
           case when count(distinct m.currency) = 1 then min(m.currency) end,
           count(distinct m.currency) > 1
    from public.euka_ad_video_month m
    where m.item_id = any (p_item_ids)
      -- Month grain: a month counts when it overlaps the range. The screen
      -- only asks for whole months or no bounds at all.
      and (p_from is null or m.month >= date_trunc('month', p_from)::date)
      and (p_to is null or m.month <= p_to)
    group by m.item_id;
end;
$$;

revoke all on function public.euka_ad_totals_for_videos(text[], date, date) from public, anon;
grant execute on function public.euka_ad_totals_for_videos(text[], date, date) to authenticated, service_role;

create or replace function public.euka_spark_codes_for_videos(p_item_ids text[])
returns table (item_id text, spark_code text, expired boolean)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if coalesce(array_length(p_item_ids, 1), 0) > 2000 then
    raise exception 'euka_spark_codes_for_videos: at most 2000 videos per call'
      using errcode = '22023';
  end if;
  return query
    select s.item_id, s.spark_code, s.expired
    from public.euka_spark_codes s
    where s.item_id = any (p_item_ids);
end;
$$;

revoke all on function public.euka_spark_codes_for_videos(text[]) from public, anon;
grant execute on function public.euka_spark_codes_for_videos(text[]) to authenticated, service_role;

-- ------------------------------------------------------------ sync plumbing --
-- Replace one campaign-month in ONE transaction. A half-written month would
-- show a creator's spend as lower than it was, and nothing would say so.
create or replace function public.euka_ad_replace_unit(
  p_advertiser_id text,
  p_campaign_id text,
  p_month date,
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
  delete from public.euka_ad_video_month
  where advertiser_id = p_advertiser_id
    and campaign_id = p_campaign_id
    and month = p_month;

  insert into public.euka_ad_video_month (
    item_id, month, store_id, advertiser_id, campaign_id,
    cost, orders, gross_revenue, currency, synced_at
  )
  select r.item_id, p_month, p_store_id, p_advertiser_id, p_campaign_id,
         coalesce(r.cost, 0), coalesce(r.orders, 0), coalesce(r.gross_revenue, 0),
         r.currency, now()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
       as r(item_id text, cost numeric, orders integer, gross_revenue numeric, currency text);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.euka_ad_replace_unit(text, text, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.euka_ad_replace_unit(text, text, date, text, jsonb) to service_role;

-- CLAIMING, so two runs (the schedule and a manual kick) never fetch the same
-- unit at once. A claim is a ten-minute lease: a run that dies mid-unit leaves
-- it due again shortly, never stuck.
create or replace function public.euka_ad_claim_units(p_limit integer)
returns setof public.euka_ad_sync_units
language sql
security invoker
set search_path = ''
as $$
  update public.euka_ad_sync_units u
  set due_at = now() + interval '10 minutes',
      updated_at = now()
  where (u.advertiser_id, u.campaign_id, u.month) in (
    select c.advertiser_id, c.campaign_id, c.month
    from public.euka_ad_sync_units c
    where c.due_at <= now()
    -- Never-fetched first, newest month first: the month on screen by default
    -- is the current one, so that is what fills in first.
    order by (c.status = 'pending') desc, c.month desc, c.due_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning u.*;
$$;

revoke all on function public.euka_ad_claim_units(integer) from public, anon, authenticated;
grant execute on function public.euka_ad_claim_units(integer) to service_role;

create or replace function public.euka_spark_claim_days(p_limit integer)
returns setof public.euka_spark_sync_days
language sql
security invoker
set search_path = ''
as $$
  update public.euka_spark_sync_days d
  set due_at = now() + interval '10 minutes'
  where (d.store_id, d.day) in (
    select c.store_id, c.day
    from public.euka_spark_sync_days c
    where c.due_at <= now()
    order by (c.status = 'pending') desc, c.day desc, c.due_at
    limit greatest(1, least(p_limit, 20))
    for update skip locked
  )
  returning d.*;
$$;

revoke all on function public.euka_spark_claim_days(integer) from public, anon, authenticated;
grant execute on function public.euka_spark_claim_days(integer) to service_role;

-- ---------------------------------------------------------------- schedule --
-- The same shape as the TikTok nightly job: the secret and the URL live in the
-- vault, set once at deploy time, never in this file.
create or replace function public.euka_ads_set_sync_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'the sync secret must be at least 32 characters';
  end if;
  select id into v_id from vault.secrets where name = 'euka_ads_sync_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'euka_ads_sync_secret',
      'Presented by the Euka ad-figures sync in x-sync-secret');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

revoke all on function public.euka_ads_set_sync_secret(text) from anon, authenticated, public;
grant execute on function public.euka_ads_set_sync_secret(text) to service_role;

create or replace function public.euka_ads_set_sync_url(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/euka-ads-sync$' then
    raise exception 'that does not look like a euka-ads-sync function URL';
  end if;
  select id into v_id from vault.secrets where name = 'euka_ads_sync_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'euka_ads_sync_url', 'Where the Euka ad-figures sync posts');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
end;
$$;

revoke all on function public.euka_ads_set_sync_url(text) from anon, authenticated, public;
grant execute on function public.euka_ads_set_sync_url(text) to service_role;

create or replace function public.euka_ads_run_cycle()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_url text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'euka_ads_sync_secret';
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'euka_ads_sync_url';

  /*
   * NOT AN EXCEPTION, unlike the TikTok job, and deliberately. This fires
   * every five minutes. Production has no Paid Collabs and no vault entries
   * for it, and a raise there would write an error into cron's history 288
   * times a day about a feature that does not exist on that project.
   * `pnpm verify:euka-ads` asserts the vault IS set on dev, where it matters.
   */
  if v_secret is null or v_url is null then
    return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.euka_ads_run_cycle() from anon, authenticated, public;
grant execute on function public.euka_ads_run_cycle() to service_role;

select cron.unschedule('euka-ads-cycle')
where exists (select 1 from cron.job where jobname = 'euka-ads-cycle');

select cron.schedule(
  'euka-ads-cycle',
  '*/5 * * * *',
  $$ select public.euka_ads_run_cycle(); $$
);
