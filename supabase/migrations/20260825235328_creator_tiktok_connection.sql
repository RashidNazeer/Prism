-- ============================================================================
-- A CREATOR connects their OWN TikTok account.
--
-- This is the second TikTok integration and it has almost nothing in common
-- with the first. Worth stating plainly, because confusing them is the mistake
-- that cost a round of scope applications on 2026-08-25:
--
--   | | the ads connection (2026-08-17) | this one |
--   | host      | business-api.tiktok.com | open.tiktokapis.com |
--   | authorises| a BRAND's ad account    | a CREATOR's own account |
--   | done by   | a Wurx admin            | the creator, for themselves |
--   | gives     | money: cost, GMV, orders| engagement: views, likes, shares |
--
-- No scope on the first reaches the second. They are separate developer apps on
-- separate platforms with separate credentials, and this migration shares no
-- table with the other one on purpose.
--
-- WHY IT IS CREATOR-FACING, when the ads connection is emphatically not. The
-- rule that creators never see the TikTok connection is about the BRAND's ad
-- account and its spend. A creator connecting their own account to see their
-- own view count is the opposite of that: it is theirs, they opt in, and they
-- can revoke it. It is the sort of thing this product exists for.
--
-- THE FIGURES WILL NOT RECONCILE WITH `tiktok_video_daily`, EVER. Those are the
-- ad-driven slice of a video bought through GMV Max. These are the organic
-- lifetime totals for the whole video. They are different numbers measuring
-- different things, and any screen that puts them side by side must say so.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. What a creator may see about their own connection.
-- ----------------------------------------------------------------------------
/*
 * NO TOKEN IN THIS TABLE. Not one, not encrypted, not "just the refresh one".
 *
 * This table is readable by its owner, so anything in it is readable by the
 * browser, and a browser that can read an access token can act as that creator
 * on TikTok for as long as it lives. The tokens live in `private` below, which
 * no user role can reach at all. The same split is why a creator cannot read a
 * brand's budget: the commercial columns were moved to their own table rather
 * than guarded by a column grant somebody would eventually widen.
 */
create table public.creator_tiktok_connections (
  creator_id      uuid primary key references public.profiles (id) on delete cascade,

  -- TikTok's stable id for this user, and the one the API answers about.
  open_id         text not null,
  union_id        text,

  -- Enough to show "connected as @handle" with a face beside it.
  display_name    text,
  avatar_url      text,

  -- What they actually granted, recorded as TikTok reported it rather than as
  -- we asked for it. A token permanently carries the scopes it was minted with,
  -- so this is the only honest answer to "can we read their videos?".
  scope           text not null default '',

  connected_at    timestamptz not null default now(),
  last_synced_at  timestamptz,
  last_error      text,

  -- Set rather than deleted, so "they disconnected" and "they never connected"
  -- stay different states. A reconnect clears it.
  revoked_at      timestamptz
);

comment on table public.creator_tiktok_connections is
  'One row per creator who has connected their own TikTok account. Contains NO tokens by design: it is readable by its owner, so a token here would be a token in the browser. Tokens live in private.creator_tiktok_tokens.';

create index creator_tiktok_connections_open_id_idx
  on public.creator_tiktok_connections (open_id);

alter table public.creator_tiktok_connections enable row level security;

/*
 * READ YOUR OWN, AND NOTHING ELSE. No insert, update or delete policy for
 * anybody: every write goes through an Edge Function holding the service key,
 * which re-derives the creator from their JWT. A creator cannot forge a
 * connection for somebody else because there is no door for them to try.
 */
create policy "creator_tiktok_connections_select_own"
  on public.creator_tiktok_connections
  for select
  to authenticated
  using (creator_id = (select auth.uid()));

/*
 * Staff can see WHETHER somebody is connected, which is the difference between
 * "their numbers are missing" and "they never linked their account" when a
 * creator asks. Still no token anywhere near it.
 */
create policy "creator_tiktok_connections_select_staff"
  on public.creator_tiktok_connections
  for select
  to authenticated
  using (public.is_staff());

grant select on table public.creator_tiktok_connections to authenticated;
-- Automatically expose new tables is OFF on both projects, which ALSO switches
-- off the default grants to service_role. Forget this and the Edge Functions
-- see an empty table and report no connection, silently.
grant all privileges on table public.creator_tiktok_connections to service_role;

-- ----------------------------------------------------------------------------
-- 2. The tokens, where nothing wearing a user's JWT can reach them.
-- ----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

create table private.creator_tiktok_tokens (
  creator_id          uuid primary key
                        references public.creator_tiktok_connections (creator_id)
                        on delete cascade,
  access_token        text not null,
  refresh_token       text,
  -- TikTok returns lifetimes in seconds; these are the absolute times we
  -- computed from them, because a duration is useless once it is stored.
  access_expires_at   timestamptz,
  refresh_expires_at  timestamptz,
  updated_at          timestamptz not null default now()
);

comment on table private.creator_tiktok_tokens is
  'Creator TikTok OAuth tokens. In the private schema and granted ONLY to service_role, so no browser holding a user JWT can read one even if a policy elsewhere is written wrongly. Never add a view over this in public.';

alter table private.creator_tiktok_tokens enable row level security;
-- Deliberately NO policies. RLS on with no policy denies everyone; service_role
-- bypasses RLS entirely, which is exactly the access we want and the only one.

revoke all on table private.creator_tiktok_tokens from anon, authenticated, public;
grant all privileges on table private.creator_tiktok_tokens to service_role;

-- ----------------------------------------------------------------------------
-- 3. The single-use nonce that makes the callback safe.
-- ----------------------------------------------------------------------------
/*
 * The callback route is PUBLIC, because the browser arrives there straight from
 * tiktok.com and may carry no session in that tab. What makes it safe is not
 * that the route is hard to find: it is that the `state` was minted for one
 * signed-in creator, is burned on first use, and expires.
 */
create table public.creator_tiktok_oauth_states (
  state       text primary key,
  creator_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

comment on table public.creator_tiktok_oauth_states is
  'Single-use nonces for the creator TikTok OAuth round trip. Minted by an authenticated Edge Function call, burned server side on the way back. No user role can read or write this table.';

create index creator_tiktok_oauth_states_expiry_idx
  on public.creator_tiktok_oauth_states (expires_at);

alter table public.creator_tiktok_oauth_states enable row level security;
-- No policies at all: nobody but service_role has any business here.
revoke all on table public.creator_tiktok_oauth_states from anon, authenticated, public;
grant all privileges on table public.creator_tiktok_oauth_states to service_role;

-- ----------------------------------------------------------------------------
-- 4. The figures themselves, cached.
-- ----------------------------------------------------------------------------
/*
 * CACHED RATHER THAN FETCHED PER RENDER, for two reasons that both matter. The
 * Display API is rate limited per app, and a creator opening their profile
 * three times should not spend three of those. And a screen that fetches from
 * a third party on every render fails visibly whenever that party is slow.
 */
create table public.creator_tiktok_videos (
  creator_id      uuid not null references public.profiles (id) on delete cascade,
  -- TikTok's own id for the video. Text, because it is an opaque identifier and
  -- has been longer than a bigint before.
  video_id        text not null,

  title           text,
  cover_image_url text,
  share_url       text,
  duration        integer,
  posted_at       timestamptz,

  /*
   * ORGANIC LIFETIME TOTALS FOR THE WHOLE VIDEO. Not the ad-driven slice, and
   * they will never add up against `tiktok_video_daily`. Nullable because a
   * field TikTok declines to return must read as "we do not know" rather than
   * as zero, which is a number a creator would believe.
   */
  view_count      bigint,
  like_count      bigint,
  comment_count   bigint,
  share_count     bigint,

  fetched_at      timestamptz not null default now(),

  primary key (creator_id, video_id)
);

comment on table public.creator_tiktok_videos is
  'A creator''s own TikTok videos and their ORGANIC engagement, from the Display API. These are lifetime totals for the whole video and do NOT reconcile with tiktok_video_daily, which is the ad-driven slice. Any screen showing both must say so.';

create index creator_tiktok_videos_posted_idx
  on public.creator_tiktok_videos (creator_id, posted_at desc);

alter table public.creator_tiktok_videos enable row level security;

create policy "creator_tiktok_videos_select_own"
  on public.creator_tiktok_videos
  for select
  to authenticated
  using (creator_id = (select auth.uid()));

create policy "creator_tiktok_videos_select_staff"
  on public.creator_tiktok_videos
  for select
  to authenticated
  using (public.is_staff());

grant select on table public.creator_tiktok_videos to authenticated;
grant all privileges on table public.creator_tiktok_videos to service_role;

-- ----------------------------------------------------------------------------
-- 5. Housekeeping.
-- ----------------------------------------------------------------------------
/*
 * Burn expired nonces. Called by the connect function rather than scheduled:
 * this table is tiny and only grows when somebody starts a connection, so a
 * cron job for it would be more moving parts than the problem deserves.
 */
create or replace function public.creator_tiktok_sweep_states()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.creator_tiktok_oauth_states
  where expires_at < now() - interval '1 day';
$$;

revoke all on function public.creator_tiktok_sweep_states() from anon, authenticated, public;
grant execute on function public.creator_tiktok_sweep_states() to service_role;
