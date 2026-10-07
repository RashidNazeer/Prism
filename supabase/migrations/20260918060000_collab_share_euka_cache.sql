-- ============================================================================
-- EUKA'S TIER AND LAST-30-DAY GMV, PER STORE, KEPT FOR HALF AN HOUR.
--
-- The client page shows the same table the staff screen does, and two of its
-- columns — the L tier and L30 GMV — are Euka's, not ours.
--
-- WHY A CACHE AND NOT A LIVE CALL PER VIEW. A client link is passed around an
-- office; a page that called Euka's export on every open would turn one shared
-- link into a stream of multi-second requests against somebody else's API. The
-- `collab-share` function refreshes a store at most twice an hour and serves
-- the last good answer in between.
--
-- WHY NOT `creators.monthly.euka`, WHICH ALREADY HOLDS BOTH. That cache is
-- frozen: the nightly job that filled it was never vendored in and writes to a
-- retired project (see the note beside `dbEuka` in WurxUI). 800 of 1000 rows
-- carry figures stamped in July and August. Showing those to a client would be
-- a wrong number with a confident face.
--
-- A STALE ROW IS SERVED WHEN EUKA IS DOWN, deliberately: two slightly old
-- columns beat two empty ones, and every other figure on the page comes from
-- our own database and is unaffected.
--
-- Nobody reads this table through the API. RLS is on with no policy and the
-- grants name only `service_role`.
-- ============================================================================

create table public.collab_share_euka_cache (
  store_id   text primary key,
  store_name text,
  handles    jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

comment on table public.collab_share_euka_cache is
  'Per Euka store: { handle: { tier, gmv } } for the last 30 days, refreshed at most every 30 minutes by the collab-share function. Serves the client page''s tier and L30 GMV columns.';

alter table public.collab_share_euka_cache enable row level security;
revoke all on table public.collab_share_euka_cache from anon, authenticated;
grant all privileges on table public.collab_share_euka_cache to service_role;
