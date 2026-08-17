-- ============================================================================
-- A day is only "already pulled" for the videos it was pulled FOR.
--
-- THE BUG, found the first time real data went in on 2026-08-18. The sync
-- skipped any day that already had a finished run. That is right if the roster
-- never changes, and wrong the moment it does: a test run that asked about two
-- videos marked three days complete, and when forty-six real videos arrived
-- those days were skipped, so four of aarontopfinds's six videos had no history
-- at all and his screen read zero.
--
-- It would have been much worse in production than in the seed. EVERY creator
-- added after the first sync would have been permanently empty for every day
-- before they joined, because those days were already ticked off. Nothing would
-- have errored. Their numbers would simply have been missing.
--
-- THE FIX is to record WHICH videos a run covered, as a fingerprint of the
-- sorted id list, and treat a day as done only for that exact set. Add a
-- creator and the fingerprint changes, so the affected days are pulled once
-- more and everybody's history fills in. Nothing else changes: a day whose
-- roster has not changed is still skipped without an API call.
-- ============================================================================

alter table public.tiktok_sync_runs
  add column if not exists videos_hash text;

comment on column public.tiktok_sync_runs.videos_hash is
  'SHA-256 of the sorted item ids this run asked about. A day counts as already pulled only for the same set, so adding a creator refills their history instead of being silently skipped.';

-- The skip check reads (advertiser, store, date, hash), so let the index carry
-- the hash too rather than filtering it after the fact.
drop index if exists tiktok_sync_runs_lookup_idx;
create index tiktok_sync_runs_lookup_idx
  on public.tiktok_sync_runs (advertiser_id, store_id, stat_date, videos_hash);
