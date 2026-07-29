-- ============================================================================
-- Step 4: the admin review pipeline.
-- ============================================================================
-- Three things live here:
--
--   1. audit_log        who did what, to whom, when. From the browser's point
--                       of view it is read only: there are no insert, update or
--                       delete grants to `authenticated` at all, so it cannot
--                       be forged or erased by anyone holding a user token.
--
--   2. review_application()   the whole approval, in ONE transaction. Setting
--                       the application status, promoting the profile and
--                       writing the audit row must succeed or fail together.
--                       Two separate REST calls from an Edge Function could
--                       leave someone approved on one screen and an applicant
--                       on another, and that is exactly the kind of thing that
--                       is impossible to explain to a creator later.
--
--   3. Search index     the review queue is searchable by handle.
--
-- The function is `security definer` and granted to `service_role` only, so the
-- ONLY route to it is the Edge Function, which re-checks the caller's role
-- against the profiles table before it calls anything.
-- ============================================================================

-- ------------------------------------------------------------- audit log ---

create table public.audit_log (
  id bigint generated always as identity primary key,

  -- Who did it. Snapshot the email and role too: the log has to still make
  -- sense after an account is deleted, which is the moment you most want to
  -- read it.
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text,
  actor_role public.app_role,

  -- Dotted verb, for example 'application.approved'. Text rather than an enum
  -- so adding an action later is not a migration on a hot table.
  action text not null check (length(trim(action)) between 3 and 64),

  -- What it was done to.
  subject_type text not null check (length(trim(subject_type)) between 2 and 32),
  subject_id uuid,

  -- Who it was done TO, when that differs from the subject. Lets us answer
  -- "everything that has ever happened to this creator" with one index.
  target_user_id uuid references public.profiles (id) on delete set null,

  -- Anything else worth keeping. Never put secrets in here.
  detail jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only record of privileged actions. Written only by security definer functions running as service_role. Never writable from a browser.';

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_subject_idx on public.audit_log (subject_type, subject_id);
create index audit_log_target_idx
  on public.audit_log (target_user_id, created_at desc)
  where target_user_id is not null;

alter table public.audit_log enable row level security;

-- Staff read the log. Nobody writes it with a user token, not even an admin:
-- there is no insert, update or delete policy and no grant, on purpose. An
-- audit trail an admin can edit is not an audit trail.
create policy "audit_log_select_staff"
  on public.audit_log
  for select
  to authenticated
  using (public.is_staff());

grant select on public.audit_log to authenticated;
grant all privileges on table public.audit_log to service_role;

-- --------------------------------------------------------- search index ----
-- The queue searches by TikTok handle with a substring match, which no plain
-- btree index can serve. Trigram makes `ilike '%foo%'` an index scan instead of
-- a full table read, which matters from the first thousand applications.

create extension if not exists pg_trgm with schema extensions;

create index applications_tiktok_handle_trgm_idx
  on public.applications
  using gin (tiktok_handle extensions.gin_trgm_ops);

-- The queue's default sort is newest first. The existing index is
-- (status, created_at) ascending, which Postgres can read backwards, but an
-- explicit descending index keeps the unfiltered path clean.
create index applications_created_at_desc_idx
  on public.applications (created_at desc);

-- --------------------------------------------------- the review, atomically -

create or replace function public.review_application(
  p_application_id uuid,
  p_decision public.application_status,
  p_actor_id uuid,
  p_tier public.creator_tier default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app      public.applications%rowtype;
  v_target   public.profiles%rowtype;
  v_actor    public.profiles%rowtype;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_new_role public.app_role;
  v_new_tier public.creator_tier;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'review_application: decision must be approved or rejected'
      using errcode = '22023';
  end if;

  -- The actor is re-read here as well as in the Edge Function. The function
  -- checks so it can return a clean 403; this checks so the database is still
  -- correct if anything ever calls it another way.
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found then
    raise exception 'review_application: unknown reviewer' using errcode = '42501';
  end if;
  if v_actor.role not in ('ops', 'admin') or not v_actor.is_active then
    raise exception 'review_application: reviewer is not active staff'
      using errcode = '42501';
  end if;

  -- Lock the row. Two admins clicking approve at the same moment is a real
  -- thing on a small team, and without this they can both win.
  select * into v_app
  from public.applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'review_application: application not found' using errcode = 'P0002';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'review_application: already reviewed as %', v_app.status
      using errcode = '55006';
  end if;

  select * into v_target from public.profiles where id = v_app.user_id;
  if not found then
    raise exception 'review_application: applicant profile is missing'
      using errcode = 'P0002';
  end if;

  -- Never let a review touch a staff account. Approving a colleague's stray
  -- application must not quietly demote them out of the admin panel.
  if v_target.role in ('ops', 'admin', 'creative_strategist') then
    raise exception 'review_application: that account is staff, review it manually'
      using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    if p_tier is null then
      raise exception 'review_application: a tier is required when approving'
        using errcode = '22023';
    end if;
    v_new_role := 'creator';
    v_new_tier := p_tier;
  else
    if p_tier is not null then
      raise exception 'review_application: a tier cannot be set when rejecting'
        using errcode = '22023';
    end if;
    -- Rejected people stay exactly as they are. Nothing is deleted, so a
    -- decision can be revisited by hand and the history survives.
    v_new_role := v_target.role;
    v_new_tier := v_target.tier;
  end if;

  -- Role and tier move together in one statement, because the
  -- profiles_tier_only_for_creators constraint rejects any half-way state.
  update public.profiles
  set role = v_new_role,
      tier = v_new_tier,
      updated_at = now()
  where id = v_target.id;

  update public.applications
  set status      = p_decision,
      reviewed_by = p_actor_id,
      reviewed_at = now(),
      review_note = v_note
  where id = v_app.id;

  insert into public.audit_log (
    actor_id, actor_email, actor_role,
    action, subject_type, subject_id, target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role,
    'application.' || p_decision, 'application', v_app.id, v_target.id,
    jsonb_strip_nulls(jsonb_build_object(
      'tiktok_handle',    v_app.tiktok_handle,
      'worked_with_wurx', v_app.worked_with_wurx,
      'tier',             v_new_tier,
      'previous_role',    v_target.role,
      'note',             v_note
    ))
  );

  return jsonb_build_object(
    'application_id', v_app.id,
    'user_id',        v_target.id,
    'status',         p_decision,
    'role',           v_new_role,
    'tier',           v_new_tier,
    'reviewed_at',    now()
  );
end;
$$;

comment on function public.review_application is
  'Approve or reject an application atomically: status, role, tier and the audit row all move together. service_role only; the Edge Function is the only caller and it re-checks the caller is active staff first.';

-- Locked to the server. A user token cannot reach this even by guessing the
-- name, which is the point of putting the whole decision behind an Edge
-- Function rather than trusting the browser.
revoke all on function public.review_application(uuid, public.application_status, uuid, public.creator_tier, text)
  from public, anon, authenticated;
grant execute on function public.review_application(uuid, public.application_status, uuid, public.creator_tier, text)
  to service_role;
