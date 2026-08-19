-- ============================================================================
-- One function per name, 2026-08-20
--
-- `20260820140000` added a `p_source` argument to `creator_daily_performance`
-- with `create or replace`, which does not replace anything: a different
-- argument list is a different function. So the database ended up carrying two
-- overloads of the same name, and PostgREST resolves an RPC by the argument
-- NAMES a request happens to send. `check-performance.mjs` calls it with two,
-- got the old body, and came back with an empty series while the video card
-- above it was full — which is exactly the "two answers to one question" shape
-- the whole week has been about.
--
-- `creator_video_performance` did not have this problem, because adding a
-- return column forced a `drop` first. The one that only gained an argument
-- slipped through.
-- ============================================================================

drop function if exists public.creator_daily_performance(date, date);
