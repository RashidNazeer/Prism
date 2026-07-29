-- ============================================================================
-- Creator applications.
-- ============================================================================
-- One application per account. Applying creates the account, so an application
-- always belongs to a real signed-in person and we never have to match a form
-- back to a login by email later.
--
-- Security posture:
--   * A user may create and edit their OWN application, and only while it is
--     still pending. Once reviewed it is frozen to them.
--   * status, reviewed_by, reviewed_at and review_note are staff only, enforced
--     by column grants and a guard trigger, the same belt-and-braces pattern
--     used on profiles.role.
--   * Ops and admin read everything. Creative strategists read nothing here.
-- ============================================================================

create type public.application_status as enum ('pending', 'approved', 'rejected');

create table public.applications (
  id uuid primary key default gen_random_uuid(),

  -- One row per account. Cascades, so deleting a user leaves nothing orphaned.
  user_id uuid not null unique references public.profiles (id) on delete cascade,

  -- Stored WITHOUT the leading @, matching src/lib/schemas/application.ts.
  -- Step 7's identity mapping assumes that.
  tiktok_handle text not null check (length(trim(tiktok_handle)) between 2 and 64),

  niche text not null check (length(trim(niche)) between 2 and 60),
  -- Only set when niche is "Other".
  niche_other text check (niche_other is null or length(trim(niche_other)) <= 60),

  -- Deliberately its own column: Rashid flagged this as important because it
  -- drives fast-tracking existing Wurx creators during review.
  worked_with_wurx boolean not null,

  video_links text not null check (length(trim(video_links)) between 8 and 1000),

  status public.application_status not null default 'pending',

  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.applications is
  'Creator applications. One per account, created at sign up.';

-- The review queue sorts by status then oldest first, so index for that.
create index applications_status_created_idx
  on public.applications (status, created_at);
create index applications_worked_with_wurx_idx
  on public.applications (worked_with_wurx) where worked_with_wurx;
create index applications_reviewed_by_idx
  on public.applications (reviewed_by) where reviewed_by is not null;

-- ---------------------------------------------------------- row security ---

alter table public.applications enable row level security;

create policy "applications_select_own"
  on public.applications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "applications_select_staff"
  on public.applications
  for select
  to authenticated
  using (public.is_staff());

-- You may file your own application, and it starts pending. Nobody gets to
-- submit one that is already approved.
create policy "applications_insert_own"
  on public.applications
  for insert
  to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

-- You may correct your own application, but only until it has been reviewed.
create policy "applications_update_own_while_pending"
  on public.applications
  for update
  to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()));

create policy "applications_update_staff"
  on public.applications
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------- grants ---
-- Auto-expose is off, so nothing is reachable without an explicit grant.

grant select on public.applications to authenticated;

grant insert (user_id, tiktok_handle, niche, niche_other, worked_with_wurx, video_links)
  on public.applications to authenticated;

grant update (tiktok_handle, niche, niche_other, worked_with_wurx, video_links)
  on public.applications to authenticated;

grant all privileges on table public.applications to service_role;

-- ------------------------------------------------------------- guard ------

create or replace function public.applications_guard_review_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.status         is distinct from old.status
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.review_note is distinct from old.review_note
    or new.user_id     is distinct from old.user_id
  ) and not (public.is_service_role() or public.is_staff()) then
    raise exception 'applications: review fields are staff only'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_guard_review_columns
  before update on public.applications
  for each row
  execute function public.applications_guard_review_columns();

-- ------------------------------------------------------------- realtime ---
-- Step 4 requires the applicant to watch their status change without
-- refreshing. Realtime still respects row level security, so a creator only
-- ever receives events for rows they are allowed to read: their own.

alter publication supabase_realtime add table public.applications;

-- Realtime needs the previous row values to evaluate policies on UPDATE.
alter table public.applications replica identity full;
