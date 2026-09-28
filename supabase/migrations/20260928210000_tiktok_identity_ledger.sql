-- ============================================================================
-- THE TIKTOK IDENTITY LEDGER, AND HANDLES THAT STOP BEING A LIE
--
-- Rashid, 2026-09-28: "the same person should never be able to apply again",
-- and the handle should be pre-filled and verified rather than typed.
--
-- WHY A SECOND TABLE INSTEAD OF REUSING creator_tiktok_connections.
-- That table already has a one-account guard, but it is deliberately a PARTIAL
-- unique index `where revoked_at is null`: disconnecting FREES the TikTok
-- account for the next profile, which is right for "connect your account" and
-- exactly wrong for "you have already applied". A creator could apply, be
-- rejected, disconnect, and apply again forever. The rule Rashid asked for has
-- to outlive the connection, the rejection and the account itself, so it lives
-- in its own ledger and nothing here is ever removed by a disconnect.
--
-- ONE FACT, ONE WRITER. Both routes -- the existing Settings connect and the
-- signup flow to come -- feed this ledger through a TRIGGER on the connections
-- table rather than through a second copy of the logic in TypeScript. Two
-- places writing one fact is this project's most repeated bug.
--
-- THE GENERATION COLUMN IS NOT BUREAUCRACY. Production still runs TikTok's
-- SANDBOX client key, so every `open_id` on file today is sandbox-scoped and
-- WILL CHANGE when the approved app's key is installed. Without recording which
-- key vouched for an id, the day that key changes is the day this rule silently
-- stops matching anybody, with no error anywhere. With it, that day is a
-- visible new generation and a documented one-time amnesty.
-- ============================================================================

create table if not exists public.tiktok_identities (
  id              uuid primary key default gen_random_uuid(),

  -- TikTok's stable id for the account, and the app key that vouched for it.
  -- Never a handle: handles get renamed, open ids do not.
  open_id         text not null check (length(trim(open_id)) between 1 and 200),
  app_generation  text not null default 'sandbox-2026'
                    check (length(trim(app_generation)) between 1 and 60),

  -- TikTok's cross-account person id where it is given. RECORDED, NEVER
  -- ENFORCED: a second TikTok account is free, so refusing on this would
  -- occasionally lock out a real creator for a reason nobody can see. It is
  -- here so staff can be shown "this looks like the same person as X".
  union_id        text,

  -- Who claimed it. Both nullable ON PURPOSE: the claim must survive the
  -- profile being deleted, or deleting an account would quietly unbar someone.
  profile_id      uuid references public.profiles (id) on delete set null,
  application_id  uuid references public.applications (id) on delete set null,

  -- The handle TikTok itself vouched for at claim time, normalised.
  handle          text check (handle is null or handle ~ '^[a-z0-9._]{2,24}$'),

  -- 'settings' = the existing connect flow, 'signup' = the flow to come.
  source          text not null default 'settings'
                    check (source in ('settings', 'signup', 'backfill')),

  claimed_at      timestamptz not null default now(),

  -- A staff release, which is the ONLY way a barred TikTok account applies
  -- again. Set rather than deleted, so the history stays readable.
  released_at     timestamptz,
  released_by     uuid references public.profiles (id) on delete set null,
  release_reason  text check (release_reason is null or length(release_reason) <= 500)
);

-- THE RULE ITSELF. Partial, so a released account genuinely re-opens -- a plain
-- unique index would make the release button do nothing at all, which is worth
-- naming because it is the obvious way to write this.
create unique index if not exists tiktok_identities_one_claim_idx
  on public.tiktok_identities (open_id, app_generation)
  where released_at is null;

create index if not exists tiktok_identities_profile_idx
  on public.tiktok_identities (profile_id);
create index if not exists tiktok_identities_union_idx
  on public.tiktok_identities (union_id)
  where union_id is not null;

comment on table public.tiktok_identities is
  'Permanent record of every TikTok account that has claimed an application here. Outlives the connection, the rejection and the profile, which is what makes "one TikTok, one application" real. Released only by staff. app_generation records which TikTok app key vouched for the open_id, because those ids change when the sandbox key is replaced.';

-- ------------------------------------------------------------ row security --
alter table public.tiktok_identities enable row level security;

-- Staff read it; nobody writes it with a user token. Writes happen in the
-- trigger and in the release function, both of which run as definer.
drop policy if exists tiktok_identities_staff_select on public.tiktok_identities;
create policy tiktok_identities_staff_select on public.tiktok_identities
  for select to authenticated
  using (public.is_staff());

-- ------------------------------------------------------------------ grants --
-- Explicit, per table: "Automatically expose new tables" is OFF, and that also
-- switches off the default grants to service_role.
grant select on table public.tiktok_identities to authenticated;
grant all privileges on table public.tiktok_identities to service_role;

-- ============================================================================
-- THE GENERATION ON A CONNECTION
--
-- The trigger below copies this onto the ledger. Existing rows are stamped
-- 'sandbox-2026' because that is the truth: every one of them was minted
-- against the sandbox key.
-- ============================================================================
alter table public.creator_tiktok_connections
  add column if not exists app_generation text not null default 'sandbox-2026';

comment on column public.creator_tiktok_connections.app_generation is
  'Which TikTok app key minted this connection. open_ids are scoped to the key, so this is what stops the identity rule silently unmatching everybody on the day the approved key replaces the sandbox one.';

-- ============================================================================
-- ONE FACT, ONE WRITER: connecting a TikTok account claims it.
--
-- Runs for the existing Settings flow and for the signup flow alike, so the
-- ledger cannot drift from reality whichever route wrote the connection.
--
-- IT NEVER RAISES. A connection that cannot be recorded must not break a
-- creator's connect -- the bar is enforced by the unique index when a SECOND
-- claim is attempted, not by this trigger. `on conflict do nothing` is the
-- point: re-connecting the same account is not a new claim.
-- ============================================================================
create or replace function public.tiktok_identity_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.revoked_at is null then
    insert into public.tiktok_identities
      (open_id, app_generation, union_id, profile_id, application_id, source)
    select
      new.open_id,
      coalesce(new.app_generation, 'sandbox-2026'),
      new.union_id,
      new.creator_id,
      (select a.id from public.applications a where a.user_id = new.creator_id),
      'settings'
    on conflict do nothing;
  end if;
  return new;
end;
$fn$;

drop trigger if exists tiktok_identity_claim_trg on public.creator_tiktok_connections;
create trigger tiktok_identity_claim_trg
  after insert or update of open_id, revoked_at on public.creator_tiktok_connections
  for each row execute function public.tiktok_identity_claim();

-- ============================================================================
-- BACKFILL: every account already connected has already claimed.
--
-- A REVOKED connection is recorded as ALREADY RELEASED. Somebody who
-- deliberately disconnected months ago must not wake up barred by a rule that
-- did not exist when they did it.
-- ============================================================================
insert into public.tiktok_identities
  (open_id, app_generation, union_id, profile_id, application_id, source,
   claimed_at, released_at, release_reason)
select
  c.open_id,
  coalesce(c.app_generation, 'sandbox-2026'),
  c.union_id,
  c.creator_id,
  (select a.id from public.applications a where a.user_id = c.creator_id),
  'backfill',
  c.connected_at,
  c.revoked_at,
  case when c.revoked_at is not null
       then 'Disconnected before the identity rule existed; not barred.' end
from public.creator_tiktok_connections c
on conflict do nothing;

-- ============================================================================
-- HANDLES: verified or typed, never one quietly pretending to be the other
-- ============================================================================
alter table public.applications
  add column if not exists tiktok_handle_verified boolean not null default false;

comment on column public.applications.tiktok_handle_verified is
  'True only when TikTok itself vouched for this handle. NOT in any column grant to authenticated, so an applicant cannot set it -- which is the entire point of the flag.';

-- UNIQUENESS APPLIES ONLY TO VERIFIED HANDLES, and that is deliberate rather
-- than timid. Dev already holds one duplicate typed handle ("roseamyg3" twice),
-- and a bare unique index would abort this migration on real data -- the exact
-- failure the reviews predicted. Typed handles keep behaving as they do today;
-- a handle TikTok vouched for can never collide with another.
create unique index if not exists applications_verified_handle_idx
  on public.applications (lower(trim(tiktok_handle)))
  where tiktok_handle_verified;

-- A VERIFIED HANDLE IS NOT THE APPLICANT'S TO EDIT.
-- `grant update (tiktok_handle)` to authenticated already exists and is needed
-- for the ordinary typed case, so the guard has to be a trigger rather than a
-- grant. Staff and service_role are unaffected.
create or replace function public.applications_guard_verified_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if old.tiktok_handle_verified
     and new.tiktok_handle is distinct from old.tiktok_handle
     and not public.is_staff()
     and not public.is_service_role() then
    raise exception 'This TikTok handle was verified by TikTok and cannot be changed here. Ask the Wurx team if it is wrong.'
      using errcode = 'check_violation';
  end if;
  -- Nor may anyone but staff flip the flag itself through an update.
  if new.tiktok_handle_verified is distinct from old.tiktok_handle_verified
     and not public.is_staff()
     and not public.is_service_role() then
    raise exception 'Not allowed to change whether a handle is verified.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists applications_guard_verified_handle_trg on public.applications;
create trigger applications_guard_verified_handle_trg
  before update on public.applications
  for each row execute function public.applications_guard_verified_handle();

-- ============================================================================
-- THE STAFF RELEASE. The only way a barred TikTok account applies again.
--
-- Rashid, 2026-09-28: a rejection must NOT be permanent -- "we should let admin
-- review the rejected again". So this is an ordinary, auditable staff action
-- rather than an exception, and it is shipped in the same step as the rule so
-- nobody is ever barred with no way out.
-- ============================================================================
create or replace function public.release_tiktok_identity(
  p_identity_id uuid,
  p_reason      text
)
returns public.tiktok_identities
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row   public.tiktok_identities;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to release a TikTok account.'
      using errcode = 'check_violation';
  end if;

  -- Locked, so two staff releasing at once cannot both believe they did it.
  select * into v_row from public.tiktok_identities
    where id = p_identity_id for update;
  if not found then
    raise exception 'No such TikTok identity.' using errcode = 'no_data_found';
  end if;
  if v_row.released_at is not null then
    return v_row;                       -- already released; idempotent
  end if;

  update public.tiktok_identities
     set released_at = now(), released_by = v_actor, release_reason = trim(p_reason)
   where id = p_identity_id
  returning * into v_row;

  -- subject_type is NOT NULL, and actor_email/actor_role are snapshotted so the
  -- row still reads after the account is gone -- the moment you most want it.
  insert into public.audit_log
    (actor_id, actor_email, actor_role, action, subject_type, subject_id,
     target_user_id, detail)
  select
    v_actor, p.email, p.role,
    'tiktok.identity_released', 'tiktok_identity', v_row.id,
    v_row.profile_id,
    jsonb_build_object('open_id', v_row.open_id, 'handle', v_row.handle,
                       'app_generation', v_row.app_generation,
                       'reason', trim(p_reason))
  from public.profiles p
  where p.id = v_actor;

  return v_row;
end;
$fn$;

revoke all on function public.release_tiktok_identity(uuid, text) from public, anon;
grant execute on function public.release_tiktok_identity(uuid, text) to authenticated, service_role;
