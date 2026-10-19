-- ============================================================================
-- REACHER VIDEOS THAT BELONG TO NOBODY ON THE ROSTER.
--
-- Rashid, 2026-10-20: "check why we are unable to get all the videos from
-- Reacher whereas I can see them on the Reacher dashboard."
--
-- WHY. `reacher-sync` files a Reacher video onto a Paid Collabs row only when
-- the video's creator handle matches a row on the brand's roster. Measured on
-- 2026-10-20 for Irwin Naturals: Reacher held 1,212 videos worth $11,789.74;
-- 162 ($7,914.30) belonged to rostered creators and were all filed; the other
-- 1,050 videos ($3,875.44) came from 408 handles that are on no roster row, and
-- were counted and then dropped. Nothing was wrong with the matching.
--
-- WHAT THIS ADDS. A place to keep those videos, so they are visible without
-- adding 400 affiliates to the Paid Collabs table (which would change every
-- creator count, deal total and payout status). The sync writes them here; the
-- brand page reads them as one quiet list. Nothing existing is changed.
-- ============================================================================

create table if not exists public.reacher_unrostered_videos (
  -- TikTok's video id; falls back to the lower-cased URL when there is none.
  video_key   text primary key,
  shop_id     integer not null,
  handle      text not null,
  video_url   text not null,
  posted_date date,
  views       integer not null default 0,
  gmv         numeric(14, 2) not null default 0,
  units       integer not null default 0,
  likes       integer not null default 0,
  comments    integer not null default 0,
  product     text,
  synced_at   timestamptz not null default now()
);

comment on table public.reacher_unrostered_videos is
  'Reacher videos whose creator handle is on no Paid Collabs roster row for the brand. Written by reacher-sync; a handle that later joins the roster has its rows removed here when its videos are filed there.';

create index if not exists reacher_unrostered_videos_handle_idx
  on public.reacher_unrostered_videos (shop_id, handle);

alter table public.reacher_unrostered_videos enable row level security;

drop policy if exists reacher_unrostered_select_staff on public.reacher_unrostered_videos;
create policy reacher_unrostered_select_staff on public.reacher_unrostered_videos
  for select to authenticated
  using (public.is_collabs_viewer());

-- Explicit grants: this project does not auto-expose new tables, and without
-- the service_role grant the Edge Function would silently see nothing.
grant select on table public.reacher_unrostered_videos to authenticated;
grant all privileges on table public.reacher_unrostered_videos to service_role;
