-- ============================================================================
-- FOLLOWER COUNTS FOR CREATORS EUKA'S SHOP DATA HAS NEVER HEARD OF.
--
-- Rashid, 2026-09-18: "is there any other way of fetching their follower count
-- other than euka? maybe through handle".
--
-- There is, and it is still Euka — a different half of it. The per-shop exports
-- only describe creators who have been active in one of OUR shops in the last
-- thirty days, which is why 380 of 464 people had no follower count. Euka's
-- market intelligence covers TikTok's whole creator population and can be
-- searched by handle: `/market-intelligence/tiktok/creator/rank` with a
-- `keyword`. Probed on 2026-09-18, it found @maddie.restucci (19,200) and
-- @macrosandmovement (17,600), both of them dashes on the screen.
--
-- ONLY AN EXACT HANDLE MATCH IS EVER STORED. The endpoint is a keyword SEARCH,
-- so "maddie" could answer with somebody else entirely. A row lands here only
-- when the handle Euka returns equals the handle we asked about, normalised.
-- Everything else is recorded as a MISS, so the same fruitless search is not
-- repeated every hour and an empty cell keeps meaning "we do not know".
--
-- THE TWO SOURCES DISAGREE, and that is expected: the shop export said 361,800
-- for @dulcedagda while market intelligence said 378,200 the same afternoon.
-- Different windows, both Euka's. The screen prefers the live shop figure when
-- it has one and falls back to this, so the number beside a creator is the
-- freshest one available rather than an average of two.
-- ============================================================================

create table public.euka_creator_followers (
  handle      text primary key check (handle = lower(handle) and handle !~ '^@'),
  followers   integer,
  creator_id  text,
  found       boolean not null default false,
  checked_at  timestamptz not null default now()
);

comment on table public.euka_creator_followers is
  'Follower counts looked up by handle in Euka''s market intelligence, for creators its shop exports do not cover. `found = false` records a search that matched nothing, so it is not repeated hourly.';
comment on column public.euka_creator_followers.handle is
  'Lower case, no @. The key both sides are normalised to before any comparison.';

create index euka_creator_followers_stale_idx on public.euka_creator_followers (checked_at);

alter table public.euka_creator_followers enable row level security;

-- Readable by the people who read Paid Collabs, written only by the sync.
create policy euka_creator_followers_select_collabs on public.euka_creator_followers
  for select to authenticated using (public.is_collabs_viewer());

revoke all on table public.euka_creator_followers from anon;
grant select on table public.euka_creator_followers to authenticated;
grant all privileges on table public.euka_creator_followers to service_role;

-- ---------------------------------------------------------------- the read --
-- The screen asks about the handles on it, and gets back only the ones we know.
create or replace function public.euka_followers_for_handles(p_handles text[])
returns table (handle text, followers integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.handle, f.followers
  from public.euka_creator_followers f
  where f.found
    and f.followers is not null
    and f.handle = any (select lower(ltrim(btrim(h), '@')) from unnest(coalesce(p_handles, '{}')) h)
$$;

comment on function public.euka_followers_for_handles(text[]) is
  'Stored follower counts for the handles asked about. Security invoker, so it answers only for somebody who may read Paid Collabs.';

revoke all on function public.euka_followers_for_handles(text[]) from public, anon;
grant execute on function public.euka_followers_for_handles(text[]) to authenticated, service_role;
