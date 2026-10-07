-- ============================================================================
-- TIKTOK-FIRST SIGNUP: the two rows that exist before an account does
--
-- Rashid's flow: the public page leads with "Continue with TikTok"; once TikTok
-- has vouched for them we thank them and ask for email and password, with the
-- handle already filled in; then the normal application flow continues.
--
-- ═══ WE MINT NO SESSIONS. THIS IS THE WHOLE SECURITY POSTURE. ═══
--
-- The browser creates the account with the SAME call the apply form already
-- uses, so Supabase issues every session exactly as it does today — same token,
-- same role stamp, same behaviour on refresh and in two tabs. Our server never
-- decides that somebody is logged in. It only ever answers a narrower question:
-- "the person holding this ticket proved they control TikTok account X".
--
-- That is why there is no session table here and never will be. A defect in
-- code that mints sessions does not look like a bug, it looks like a successful
-- login, and this project cannot absorb that.
--
-- ═══ TWO SECRETS, NOT ONE ═══
--
-- TikTok does not offer PKCE to web apps — their own documentation says
-- `code_verifier` is "required for mobile and desktop app only" — so there is
-- no standard way to bind an authorisation code to the browser that began the
-- flow. The substitute is a secret the BROWSER generates, keeps in its own
-- storage, and never sends: only its SHA-256 goes to the server at the start,
-- and the secret itself is presented once, at the end. A stolen `state` is
-- therefore not enough, and neither is a stolen code.
--
-- Both tables hold the fingerprint, never the secret. The same reasoning as
-- `collab_client_shares`: a link is a password and is stored like one.
-- ============================================================================

-- ------------------------------------------------- 1. the round-trip nonce --
create table if not exists public.tiktok_signup_states (
  -- 32 random bytes as hex, minted server side. The only thing tying the
  -- return from TikTok to a flow we actually started.
  state               text primary key check (state ~ '^[0-9a-f]{64}$'),

  -- SHA-256 of the secret the browser kept. NEVER the secret.
  browser_secret_hash text not null check (browser_secret_hash ~ '^[0-9a-f]{64}$'),

  -- If a signed-in applicant starts this (they have an account but no verified
  -- handle yet) we remember who, so the finish can be attributed without the
  -- browser being believed about it.
  started_by          uuid references public.profiles (id) on delete set null,

  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  used_at             timestamptz
);

create index if not exists tiktok_signup_states_expiry_idx
  on public.tiktok_signup_states (expires_at);

comment on table public.tiktok_signup_states is
  'Single-use nonce for the TikTok-first signup round trip, plus the fingerprint of the secret the browser kept. Holds no secret and no token. Burned in one conditional UPDATE so the database decides every race.';

alter table public.tiktok_signup_states enable row level security;
-- NO POLICIES. Nobody but service_role has any business here, and a table a
-- browser can read is a table an attacker can enumerate.
revoke all on table public.tiktok_signup_states from anon, authenticated, public;
grant all privileges on table public.tiktok_signup_states to service_role;

-- --------------------------------- 2. a proven TikTok identity, unclaimed --
create table if not exists public.tiktok_signup_pending (
  id                  uuid primary key default gen_random_uuid(),

  -- SHA-256 of the ticket handed to the browser once TikTok has vouched. The
  -- ticket itself is never stored, so this table leaking proves nothing and
  -- grants nothing.
  ticket_hash         text not null unique check (ticket_hash ~ '^[0-9a-f]{64}$'),

  -- And the same browser that started the flow has to finish it.
  browser_secret_hash text not null check (browser_secret_hash ~ '^[0-9a-f]{64}$'),

  -- What TikTok told us. `handle` is the prize: verified, not typed.
  open_id             text not null,
  union_id            text,
  display_name        text,
  avatar_url          text,
  handle              text check (handle is null or handle ~ '^[a-z0-9._]{2,24}$'),
  scope               text not null default '',

  -- THE TOKENS LIVE HERE BECAUSE THE CODE IS SPENT IMMEDIATELY.
  -- An authorisation code left lying around while a person types their email is
  -- a code that can be stolen from a phone's history or a log; it is redeemed
  -- the instant it arrives instead. That leaves us holding tokens that belong
  -- to nobody yet, which is why this table is service_role only and why an
  -- abandoned row is revoked at TikTok before it is deleted.
  access_token        text,
  refresh_token       text,
  access_expires_at   timestamptz,
  refresh_expires_at  timestamptz,

  -- Set when a signed-in applicant started the flow, so finishing binds to the
  -- account that began it rather than to whoever presents the ticket.
  started_by          uuid references public.profiles (id) on delete set null,

  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,

  -- Who eventually claimed it, and when. Kept briefly after claiming so a
  -- double-submit is idempotent rather than a second binding.
  claimed_at          timestamptz,
  claimed_by          uuid references public.profiles (id) on delete set null
);

create index if not exists tiktok_signup_pending_expiry_idx
  on public.tiktok_signup_pending (expires_at);
create index if not exists tiktok_signup_pending_open_idx
  on public.tiktok_signup_pending (open_id);

comment on table public.tiktok_signup_pending is
  'A TikTok identity that has been proven but not yet attached to an account. Holds live TikTok tokens, because the authorisation code is redeemed the moment it arrives rather than left lying about while somebody types an email. service_role only. An abandoned row is revoked at TikTok before it is deleted.';

alter table public.tiktok_signup_pending enable row level security;
revoke all on table public.tiktok_signup_pending from anon, authenticated, public;
grant all privileges on table public.tiktok_signup_pending to service_role;

-- ============================================================================
-- THE CLAIM, IN ONE STATEMENT.
--
-- Binding a proven TikTok identity to a just-created account touches four
-- tables. Doing it from TypeScript leaves four chances to half-succeed, and a
-- half-bound identity is the shape of every impersonation bug in this design.
-- So it is one `security definer` function, and the database decides.
--
-- IT REFUSES AN ACCOUNT OLDER THAN THE TICKET. The ticket is proof that
-- somebody controlled a TikTok account a moment ago; it is not proof that they
-- own whatever account is presenting it. Requiring the profile to have been
-- created AFTER the pending row means a stolen ticket cannot be attached to an
-- existing creator — the case that would matter most.
-- ============================================================================
create or replace function public.claim_tiktok_signup(
  p_ticket_hash         text,
  p_browser_secret_hash text,
  p_profile             uuid
)
returns table (open_id text, handle text, already boolean)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row     public.tiktok_signup_pending;
  v_profile public.profiles;
begin
  if not public.is_service_role() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.tiktok_signup_pending
   where ticket_hash = p_ticket_hash for update;
  if not found then
    raise exception 'That link has expired. Start again from the sign-up page.'
      using errcode = 'no_data_found';
  end if;

  -- The same browser that earned the ticket has to spend it.
  if v_row.browser_secret_hash is distinct from p_browser_secret_hash then
    raise exception 'That link has expired. Start again from the sign-up page.'
      using errcode = 'no_data_found';
  end if;

  if v_row.expires_at < now() then
    raise exception 'That link has expired. Start again from the sign-up page.'
      using errcode = 'no_data_found';
  end if;

  -- A second submit of the same form returns the same answer rather than
  -- binding twice or failing in a way that strands somebody mid-signup.
  if v_row.claimed_at is not null then
    if v_row.claimed_by = p_profile then
      return query select v_row.open_id, v_row.handle, true;
      return;
    end if;
    raise exception 'That link has already been used.' using errcode = 'no_data_found';
  end if;

  select * into v_profile from public.profiles where id = p_profile;
  if not found then
    raise exception 'No such account.' using errcode = 'no_data_found';
  end if;
  -- THE ACCOUNT MUST BE NEWER THAN THE PROOF.
  if v_profile.created_at < v_row.created_at then
    raise exception 'That link cannot be used with this account.'
      using errcode = 'insufficient_privilege';
  end if;
  -- Unless the flow was started by that very account, which is the signed-in
  -- applicant finishing what they began.
  if v_row.started_by is not null and v_row.started_by is distinct from p_profile then
    raise exception 'That link belongs to a different sign-up.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Somebody else may have claimed this TikTok account in the meantime.
  if exists (
    select 1 from public.tiktok_identities i
     where i.open_id = v_row.open_id
       and i.released_at is null
       and i.profile_id is distinct from p_profile
  ) then
    raise exception 'That TikTok account has already been used on another Wurx account.'
      using errcode = 'unique_violation';
  end if;

  insert into public.creator_tiktok_connections
    (creator_id, open_id, union_id, display_name, avatar_url, scope,
     connected_at, revoked_at, app_generation)
  values
    (p_profile, v_row.open_id, v_row.union_id, v_row.display_name, v_row.avatar_url,
     v_row.scope, now(), null, 'sandbox-2026')
  on conflict (creator_id) do update
    set open_id = excluded.open_id, union_id = excluded.union_id,
        display_name = excluded.display_name, avatar_url = excluded.avatar_url,
        scope = excluded.scope, connected_at = excluded.connected_at,
        revoked_at = null;

  insert into public.creator_tiktok_tokens
    (creator_id, access_token, refresh_token, access_expires_at, refresh_expires_at, updated_at)
  values
    (p_profile, v_row.access_token, v_row.refresh_token,
     v_row.access_expires_at, v_row.refresh_expires_at, now())
  on conflict (creator_id) do update
    set access_token = excluded.access_token, refresh_token = excluded.refresh_token,
        access_expires_at = excluded.access_expires_at,
        refresh_expires_at = excluded.refresh_expires_at, updated_at = now();

  -- The claim itself. The trigger on connections has already written one; this
  -- fills in what only signup knows.
  update public.tiktok_identities
     set handle = coalesce(v_row.handle, handle), source = 'signup'
   where open_id = v_row.open_id and released_at is null;

  -- THE VERIFIED HANDLE, which is the point of the whole exercise.
  if v_row.handle is not null then
    update public.applications
       set tiktok_handle = v_row.handle, tiktok_handle_verified = true
     where user_id = p_profile;
  end if;

  update public.tiktok_signup_pending
     set claimed_at = now(), claimed_by = p_profile,
         access_token = null, refresh_token = null   -- moved, not copied
   where id = v_row.id;

  insert into public.audit_log
    (actor_id, actor_email, actor_role, action, subject_type, subject_id,
     target_user_id, detail)
  values
    (p_profile, v_profile.email, v_profile.role,
     'tiktok_signup.claimed', 'creator_tiktok_connection', p_profile, p_profile,
     jsonb_build_object('open_id', v_row.open_id, 'handle', v_row.handle,
                        'started_signed_in', v_row.started_by is not null));

  return query select v_row.open_id, v_row.handle, false;
end;
$fn$;

revoke all on function public.claim_tiktok_signup(text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_tiktok_signup(text, text, uuid) to service_role;

-- ============================================================================
-- THE APPLICATION TAKES ITS HANDLE FROM THE LEDGER, NOT FROM THE BROWSER.
--
-- The claim above runs BEFORE the application exists: the order is TikTok,
-- then email and password, then the application form. So `update applications`
-- in the claim matches nothing for a brand-new signup, and the verified handle
-- would be lost at exactly the moment it was earned.
--
-- This closes that, and closes something better at the same time. The apply
-- form POSTs a handle like any other field, and an applicant is granted INSERT
-- on that column — so a browser could always send a handle that is not theirs.
-- Once TikTok has vouched for one, the database now OVERWRITES whatever was
-- sent. The form can pre-fill it, the person can even edit the box, and the
-- stored value is still the account they actually proved they control.
--
-- No claim, no change: an ordinary typed application behaves exactly as before.
-- ============================================================================
create or replace function public.applications_take_verified_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_handle text;
begin
  select i.handle into v_handle
    from public.tiktok_identities i
   where i.profile_id = new.user_id
     and i.released_at is null
     and i.handle is not null
   order by i.claimed_at desc
   limit 1;

  if v_handle is not null then
    new.tiktok_handle := v_handle;
    new.tiktok_handle_verified := true;
  end if;
  return new;
end;
$fn$;

drop trigger if exists applications_take_verified_handle_trg on public.applications;
create trigger applications_take_verified_handle_trg
  before insert on public.applications
  for each row execute function public.applications_take_verified_handle();
