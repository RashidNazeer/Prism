-- ============================================================================
-- Step 1: auth foundation. Profiles, roles, tiers, and the JWT claims hook.
-- ============================================================================
-- Security posture for this file:
--   * RLS on, deny by default. Every policy is written out explicitly.
--   * A user can NEVER set their own role or tier. Enforced three ways: no
--     INSERT grant, a column-level UPDATE grant covering display_name only, and
--     a BEFORE UPDATE trigger that raises if role/tier/is_active changed by
--     anyone who is not an admin or the service role.
--   * Role and tier are copied into the JWT by an access token hook, so
--     policies read a claim instead of querying this table on every request.
-- ============================================================================

-- ----------------------------------------------------------------- enums ---

create type public.app_role as enum (
  'applicant',
  'creator',
  'creative_strategist',
  'ops',
  'admin'
);

-- Thresholds (first tracked sale, $1K, $10K, $50K GMV) get applied by the tier
-- automation in Phase 2. This enum only names the levels.
create type public.creator_tier as enum (
  'creator',
  'rising',
  'pro',
  'elite'
);

-- -------------------------------------------------------------- profiles ---

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Denormalised from auth.users so admin screens can search and sort without
  -- reaching into the auth schema. Kept in sync by trigger below.
  email text not null,
  display_name text,

  role public.app_role not null default 'applicant',

  -- Null for everyone who is not a creator.
  tier public.creator_tier,

  -- Soft disable, preferred over deleting so history survives.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_tier_only_for_creators
    check (tier is null or role = 'creator')
);

comment on table public.profiles is
  'One row per authenticated user. Role and tier live here and nowhere else.';

-- Index every column we will filter or sort on. Admin lists page through these.
create index profiles_role_idx on public.profiles (role);
create index profiles_tier_idx on public.profiles (tier) where tier is not null;
create index profiles_created_at_idx on public.profiles (created_at desc);
create unique index profiles_email_key on public.profiles (lower(email));

-- --------------------------------------------------------------- helpers ---

-- Read the caller's role straight off the JWT. Stable and needs no table hit,
-- so it stays cheap inside a policy that runs per row.
create or replace function public.jwt_role()
returns public.app_role
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', ''),
    'applicant'
  )::public.app_role;
$$;

-- True when the request uses the service role key, which only ever happens
-- server side (Edge Functions, migrations). Lets trusted code past the guard.
create or replace function public.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.jwt_role() in ('ops', 'admin');
$$;

-- ---------------------------------------------------------- row security ---

alter table public.profiles enable row level security;

-- Everyone reads their own profile.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- Ops and admin read everyone. Creative strategists deliberately do not: they
-- get scoped access to their assigned brands later, not the whole user table.
create policy "profiles_select_staff"
  on public.profiles
  for select
  to authenticated
  using (public.is_staff());

-- Users may edit their own row. WHICH columns is controlled by the column grant
-- below, not by this policy.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Admins may edit anyone. Approvals and tier assignment go through an Edge
-- Function in Step 4, but this keeps admin tooling possible.
create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using (public.jwt_role() = 'admin')
  with check (public.jwt_role() = 'admin');

-- No INSERT policy and no INSERT grant, on purpose: profiles are created only
-- by the trigger on auth.users, which runs as security definer.
-- No DELETE policy either. Deleting the auth user cascades to here.

-- ---------------------------------------------------------------- grants ---
-- "Automatically expose new tables" is OFF on both projects, so access has to
-- be granted explicitly. That setting is the reason this section exists.

grant select on public.profiles to authenticated;

-- The ONLY column a user may change about themselves. Adding a column here is a
-- security decision, not a convenience one.
grant update (display_name) on public.profiles to authenticated;

-- ------------------------------------------------------ escalation guard ---

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.role         is distinct from old.role
    or new.tier      is distinct from old.tier
    or new.is_active is distinct from old.is_active
    or new.id        is distinct from old.id
    or new.email     is distinct from old.email
  ) and not (public.is_service_role() or public.jwt_role() = 'admin') then
    raise exception 'profiles: role, tier, active status, id and email are not self-editable'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row
  execute function public.profiles_guard_privileged_columns();

-- ---------------------------------------------------- profile on sign up ---

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Keep the denormalised email honest if the user ever changes it.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = new.email, updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  execute function public.handle_user_email_change();

-- --------------------------------------------------- access token hook ----
-- Supabase calls this every time it mints an access token. Putting role and
-- tier into the JWT means policies read a claim instead of querying profiles on
-- every request.
--
-- IMPORTANT: an access token only refreshes about once an hour, so a role
-- change does not reach the token until then. Anything that must apply
-- instantly, like suspending an account, has to check the table, not the claim.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role   public.app_role;
  v_tier   public.creator_tier;
  v_active boolean;
  claims   jsonb;
begin
  select p.role, p.tier, p.is_active
    into v_role, v_tier, v_active
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(v_role, 'applicant')::text));
  claims := jsonb_set(
    claims,
    '{user_tier}',
    case when v_tier is null then 'null'::jsonb else to_jsonb(v_tier::text) end
  );
  claims := jsonb_set(claims, '{user_active}', to_jsonb(coalesce(v_active, true)));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only the auth service may run the hook, and it needs to read profiles to do
-- so. Nobody else gets execute rights.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.profiles to supabase_auth_admin;

create policy "profiles_select_auth_admin"
  on public.profiles
  for select
  to supabase_auth_admin
  using (true);
