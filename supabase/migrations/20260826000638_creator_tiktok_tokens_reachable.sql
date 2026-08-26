-- ============================================================================
-- The creator TikTok tokens move OUT of `private`, because PostgREST cannot
-- see that schema and the whole feature was silently broken.
--
-- WHAT WENT WRONG, an hour after `20260825235328` was written. Putting the
-- tokens in a `private` schema looked like the strongest possible protection
-- and it was, in the sense that NOBODY could reach them — including us:
--
--   service_role INSERT into private.creator_tiktok_tokens
--     -> PGRST106  Invalid schema: private
--
-- Supabase exposes only the schemas listed in its PostgREST config, and
-- `private` is deliberately not one of them. So `.schema('private')` from an
-- Edge Function fails every time, which means the callback would have taken a
-- LIVE TOKEN from TikTok and thrown it away while telling the creator they were
-- connected — and, being unable to store it, would never be able to revoke it
-- either. A grant left running at TikTok that we cannot see or cancel is worse
-- than no connection at all.
--
-- WHY THE TEST DID NOT CATCH IT, which is the part worth remembering.
-- `check-creator-tiktok.mjs` asserted "another creator cannot read the token
-- table" and passed — on `PGRST106`, an error meaning THE SCHEMA DOES NOT
-- EXIST, not one meaning permission denied. The table was empty because the
-- setup insert had failed the same way, so the check was asserting emptiness
-- rather than safety. It could not have failed. Same family as `[].every()`
-- being true of an empty list, and the third time this shape has bitten this
-- repo. The test now proves the row EXISTS before proving it is unreachable.
--
-- THE REPLACEMENT IS NOT WEAKER. A table in `public` with RLS enabled and NO
-- POLICIES AT ALL denies every user role outright: RLS with no policy is deny,
-- not allow. `service_role` bypasses RLS entirely and holds the only grant. It
-- is exactly what `creator_tiktok_oauth_states` already does, and that one
-- returned a real `42501 insufficient privilege` in the same test run, which is
-- what a genuine denial looks like.
-- ============================================================================

create table if not exists public.creator_tiktok_tokens (
  creator_id          uuid primary key
                        references public.creator_tiktok_connections (creator_id)
                        on delete cascade,
  access_token        text not null,
  refresh_token       text,
  -- TikTok returns lifetimes in seconds; these are the absolute times computed
  -- from them, because a duration is useless once it has been stored.
  access_expires_at   timestamptz,
  refresh_expires_at  timestamptz,
  updated_at          timestamptz not null default now()
);

comment on table public.creator_tiktok_tokens is
  'Creator TikTok OAuth tokens. RLS is ON with NO POLICIES, which denies every user role outright; service_role bypasses RLS and holds the only grant. Never add a policy here, and never select from it anywhere a browser can reach. It lives in public rather than a private schema only because PostgREST cannot address a schema it does not expose.';

alter table public.creator_tiktok_tokens enable row level security;

/*
 * NO POLICIES. Not one, not "select own", not for staff. RLS enabled with an
 * empty policy set is a closed door for anon and authenticated alike, and
 * `service_role` does not consult policies at all. Adding a policy here would
 * be the only way to open it, so the absence is the security control and it is
 * deliberate.
 */
revoke all on table public.creator_tiktok_tokens from anon, authenticated, public;
-- "Automatically expose new tables" is OFF, which also disables the default
-- grants to service_role. Without this line the Edge Functions see nothing.
grant all privileges on table public.creator_tiktok_tokens to service_role;

-- ----------------------------------------------------------------------------
-- Carry anything across, then remove the unreachable original.
-- ----------------------------------------------------------------------------
/*
 * Guarded, because on any project where the previous migration ran the table
 * exists but is necessarily EMPTY: nothing could ever write to it. The copy is
 * here for correctness rather than because there is anything to move.
 */
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'private' and table_name = 'creator_tiktok_tokens'
  ) then
    insert into public.creator_tiktok_tokens
      (creator_id, access_token, refresh_token, access_expires_at, refresh_expires_at, updated_at)
    select creator_id, access_token, refresh_token, access_expires_at, refresh_expires_at, updated_at
    from private.creator_tiktok_tokens
    on conflict (creator_id) do nothing;

    drop table private.creator_tiktok_tokens;
  end if;
end;
$$;

/*
 * AND THE COMMENT IN THE PREVIOUS MIGRATION WAS WRONG TWICE OVER, so it is
 * corrected here rather than left to mislead: `revoke all on schema private
 * from public` does NOT remove a USAGE grant made explicitly to
 * `authenticated`, and an earlier migration (20260813230000) granted exactly
 * that. Revoking from `public` and revoking from a named role are different
 * statements. Nothing of ours depends on it any more, but the grant should not
 * be wider than it needs to be either.
 */
revoke usage on schema private from authenticated;

-- ----------------------------------------------------------------------------
-- Two smaller things the same review turned up.
-- ----------------------------------------------------------------------------
/*
 * ONE TIKTOK ACCOUNT, ONE CREATOR. Without this, two Wurx profiles can both
 * bind the same TikTok account and both claim its videos, which is either a
 * mistake or somebody trying to inherit another creator's numbers. Partial, on
 * live connections only, so a creator who disconnects does not block whoever
 * legitimately connects that account next.
 */
create unique index if not exists creator_tiktok_connections_one_account_idx
  on public.creator_tiktok_connections (open_id)
  where revoked_at is null;

/* An unindexed FK makes every cascade from `profiles` a sequential scan. */
create index if not exists creator_tiktok_oauth_states_creator_idx
  on public.creator_tiktok_oauth_states (creator_id);
