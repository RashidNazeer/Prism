-- ============================================================================
-- The nightly sync now RE-READS the last seven days.
--
-- THE BUG, in one line: we believed a finished day could not change, and ad
-- spend can.
--
-- `tiktok-sync` skipped any day it already held, guarded on
-- (advertiser_id, store_id, stat_date, videos_hash) with a finished run. The
-- comment on its `force` flag said so outright: "a complete day cannot change".
-- That is true of `gross_revenue`, which has never moved on any day checked. It
-- is NOT true of `cost`: TikTok credits back invalid traffic for days that are
-- already closed, so the spend figure keeps moving after we have stored it, and
-- we never looked again.
--
-- WHAT IT HAD DONE, measured on 2026-08-24 by `pnpm verify:numbers`, which
-- asks TikTok the same question the sync asks and diffs it row by row:
--
--     day           ours       TikTok     overstated by
--     2026-08-19    $154.35    $135.91    13.6%
--     2026-08-20    $128.92    $128.24     0.5%
--     everything    $841.24    $817.96     2.8%
--
-- Spend too HIGH means the ROI a creator is shown is too LOW. On a product
-- whose whole promise is that the numbers are real, that is the wrong number to
-- have wrong.
--
-- WHY NOT SIMPLY `force: true` ON THE NIGHTLY RUN, which was the obvious fix
-- and is a trap. `effectiveDays` is only deepened for a late-added video when
-- `!force` (tiktok-sync/index.ts, "REACH BACK FAR ENOUGH FOR A LATE-ADDED
-- VIDEO"). So forcing the nightly run would repair stale spend and silently
-- break the case Rashid asked for by name, a creator posting on the 1st and
-- pasting the link on the 20th. The two would have traded places.
--
-- So the sync gained a SEPARATE `refreshDays`, which only removes the skip for
-- the most recent N days and leaves the backfill depth alone. `force` stays
-- what it was: a manual override for a one-off repair.
--
-- SEVEN DAYS, from the measurements rather than from a guess. Days four and
-- five out had drifted; days eight and beyond still matched TikTok exactly. The
-- cost is one extra report call per store per night per day in the window, so
-- seven calls a night for one store instead of one to three. `maxCalls`
-- (default 40) and the per-store ceiling still bound the whole run.
-- ============================================================================

/*
 * DROPPED, NOT REPLACED. `create or replace function` with a changed argument
 * list creates a second overload rather than replacing anything, and the old
 * one-argument body would stay callable and keep posting a request with no
 * refresh window in it. This project has already lost a day to exactly that.
 */
drop function if exists public.tiktok_run_nightly_sync(integer);

create or replace function public.tiktok_run_nightly_sync(
  p_days integer default 3,
  p_refresh_days integer default 7
)
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
  from vault.decrypted_secrets where name = 'tiktok_sync_secret';
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'tiktok_sync_url';

  if v_secret is null or v_url is null then
    raise exception 'the vault is missing tiktok_sync_secret or tiktok_sync_url';
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Without this the call leaves from the database's own region, and if
      -- that is Mumbai TikTok refuses it as a banned country every night.
      'x-region', 'ap-northeast-1',
      'x-sync-secret', v_secret
    ),
    body := jsonb_build_object(
      'days', p_days,
      -- The rolling re-read. Not `force`, which would switch off the backfill.
      'refreshDays', p_refresh_days
    ),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.tiktok_run_nightly_sync(integer, integer) is
  'Fires the nightly TikTok sync. p_days is how far back to reach for missing figures; p_refresh_days re-reads that many recent days even though we already hold them, because TikTok restates ad spend after a day has closed.';

revoke all on function public.tiktok_run_nightly_sync(integer, integer)
  from anon, authenticated, public;
grant execute on function public.tiktok_run_nightly_sync(integer, integer) to service_role;

/*
 * 03:20 UTC, which is 22:20 in the ad account's own timezone (Etc/GMT+5). That
 * is comfortably after its midnight has passed for the day being pulled, so
 * "yesterday" is genuinely complete rather than still being written.
 *
 * Rescheduled rather than left alone: the stored command names the function and
 * its arguments, so the old schedule would keep calling the one-argument form
 * that no longer exists.
 */
select cron.unschedule('tiktok-nightly')
where exists (select 1 from cron.job where jobname = 'tiktok-nightly');

select cron.schedule(
  'tiktok-nightly',
  '20 3 * * *',
  $$ select public.tiktok_run_nightly_sync(3, 7); $$
);
