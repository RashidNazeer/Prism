-- ============================================================================
-- When was this video posted, and how far back must the sync therefore look.
--
-- Rashid wanted to ask the creator to pick the date, because a creator might
-- add a link a month after posting and we would otherwise never fetch that
-- month. The need is real. The question is not: A TIKTOK ID CONTAINS ITS OWN
-- POSTING TIME in its top 32 bits, so we can read it exactly instead of asking
-- somebody to remember. No form field, nothing to get wrong, and it works
-- retroactively for every video already in the table.
--
-- Verified against his roster: it dates babblingbrookej's videos to April,
-- pandanamonium's to June and July, aarontopfinds's to August, which matches
-- what he said about them.
-- ============================================================================

create or replace function public.tiktok_posted_at(p_item_id text)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    -- Guard the cast: anything that is not a plain number is not a TikTok id,
    -- and an exception here would take out every query that touches a video.
    when p_item_id ~ '^[0-9]{6,20}$'
      then to_timestamp((p_item_id::bigint) >> 32)
    else null
  end;
$$;

comment on function public.tiktok_posted_at(text) is
  'The moment a TikTok video was posted, decoded from its own id. Exact, and needs no API call.';

revoke all on function public.tiktok_posted_at(text) from anon;
grant execute on function public.tiktok_posted_at(text) to authenticated, service_role;

/**
 * The window a creator may look at.
 *
 * THE FLOOR IS NOW THE POSTING DATE, not the day the link was added. Those are
 * the same thing when somebody uploads promptly and wildly different when they
 * remember three weeks later, and using the submission date would have hidden
 * every figure earned before they got round to pasting the link.
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
    min(coalesce(public.tiktok_posted_at(cs.embed_id), cs.created_at))::date as earliest,
    max(d.stat_date)                                                        as latest,
    count(distinct cs.embed_id)::integer                                    as videos
  from public.content_submissions cs
  left join public.tiktok_video_daily d on d.item_id = cs.embed_id
  where cs.creator_id = (select auth.uid())
    and cs.embed_id is not null;
$$;

revoke all on function public.creator_performance_window() from anon;
grant execute on function public.creator_performance_window() to authenticated;

/**
 * HOW MANY DAYS THE SYNC MUST REACH BACK, worked out from the videos it does
 * not yet have a single figure for.
 *
 * This is what makes a late-added video fill in by itself. A creator who posts
 * on the 1st and pastes the link on the 20th has nineteen days of earnings that
 * the nightly three-day window would never have asked about; here the job sees
 * a video with no data whose id says it is nineteen days old, and reaches back
 * that far, once.
 *
 * Videos that already have data are ignored, so this settles back to the
 * ordinary short window as soon as everything is caught up.
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
      extract(day from (now() - coalesce(public.tiktok_posted_at(cs.embed_id), cs.created_at)))::integer
    ),
    0
  )
  from public.content_submissions cs
  join public.tiktok_stores s
    on s.brand_id = cs.brand_id and s.brand_id is not null
  where cs.embed_id is not null
    and cs.ad_authorized
    and not exists (
      select 1 from public.tiktok_video_daily d where d.item_id = cs.embed_id
    );
$$;

revoke all on function public.tiktok_days_to_backfill() from anon, authenticated, public;
grant execute on function public.tiktok_days_to_backfill() to service_role;

-- ============================================================================
-- The nightly run moves, and this is a correctness fix rather than a tidy-up.
--
-- It ran at 03:20 UTC, which is 22:20 the PREVIOUS EVENING in the ad account's
-- own timezone (UTC-5). TikTok only knows that day boundary, so asking for
-- "yesterday" at that moment returned the day before the one we wanted, leaving
-- the product two days behind rather than one.
--
-- 07:00 UTC is 02:00 in the account's day: the day just ended, it is complete,
-- and asking for yesterday now means yesterday. In Pakistan that is midday,
-- which matters to nobody, since the whole point is that it runs by itself.
-- ============================================================================

select cron.unschedule('tiktok-nightly')
where exists (select 1 from cron.job where jobname = 'tiktok-nightly');

select cron.schedule(
  'tiktok-nightly',
  '0 7 * * *',
  $$ select public.tiktok_run_nightly_sync(3); $$
);
