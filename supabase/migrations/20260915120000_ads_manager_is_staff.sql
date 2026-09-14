-- ============================================================================
-- Ads Manager becomes STAFF: the same reach as Ops, everywhere.
--
-- THIS REVERSES A RULE, DELIBERATELY. On 2026-09-02 Ads Manager was created as
-- one of three read-only Paid Collabs roles, and the docs said in capitals
-- never to add a role to `is_staff()`. That rule was about not handing the
-- whole product to somebody who was only meant to READ one screen, and it
-- still stands for Affiliate Team Lead and Operations Lead.
--
-- Rashid, 2026-09-15: *"ads manager will have the same edit access as asad and
-- rashid has which means they can edit anything"*, and asked whether that
-- should be one person or the role, he chose the role. So this is not the
-- accident the rule guards against; it is the owner deciding who is staff.
--
-- WHAT "SAME AS ASAD" MEANS HERE. Asad is `ops`. Everything below admits
-- `ads_manager` exactly where it admits `ops`, and nowhere that is admin-only
-- (`jwt_role() = 'admin'`: editing other people's profiles, TikTok connection
-- health). Inside Paid Collabs the app maps the role to their `superadmin`,
-- which is what Asad carries there.
--
-- `::text` on every comparison, as in the collabs-viewer migration: it keeps
-- the file re-runnable and indifferent to when the enum label arrived.
-- ============================================================================

-- ------------------------------------------------------------------ is_staff --
-- Guards ~70 policies across the public schema, and every wurxbase write.
create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.jwt_role()::text in ('ops', 'admin', 'ads_manager');
$$;

comment on function public.is_staff() is
  'True for the staff roles: ops, admin and ads_manager (made staff 2026-09-15). '
  'Guards the whole public schema and every Paid Collabs write. Never add a role '
  'here to let somebody SEE a screen; read-only roles go in is_collabs_viewer().';

-- --------------------------------------------------------- is_collabs_viewer --
-- Ads Manager no longer needs naming here: is_staff() already admits it.
create or replace function public.is_collabs_viewer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_staff()
      or public.jwt_role()::text in ('affiliate_team_lead', 'operations_lead');
$$;

comment on function public.is_collabs_viewer() is
  'True for staff, plus the two read-only Paid Collabs roles (Affiliate Team Lead, '
  'Operations Lead). Used ONLY by wurxbase SELECT policies.';

-- ------------------------------------------------------- assert_active_staff --
-- The shared gate every brand, offer and contest write function starts with.
-- Reads the TABLE, not the claim, so a deactivation lands at once.
create or replace function public.assert_active_staff(p_actor_id uuid)
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
begin
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found then
    raise exception 'unknown actor' using errcode = '42501';
  end if;
  if v_actor.role::text not in ('ops', 'admin', 'ads_manager') or not v_actor.is_active then
    raise exception 'that account is not active staff' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

-- ------------------------------------------------------- is_approved_creator --
-- Staff preview the creator side, so staff pass here as they always have.
create or replace function public.is_approved_creator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role::text in ('creator', 'ops', 'admin', 'ads_manager')
  );
$$;

-- ------------------------------------------------- refresh_content_preview --
create or replace function public.refresh_content_preview(
  p_actor_id uuid,
  p_content_id uuid,
  p_thumbnail_url text,
  p_video_title text default null,
  p_video_author text default null,
  p_embed_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.content_submissions%rowtype;
begin
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or not v_actor.is_active then
    raise exception 'unknown actor' using errcode = '42501';
  end if;

  select * into v_row from public.content_submissions where id = p_content_id;
  if not found then
    raise exception 'no such submission' using errcode = 'P0002';
  end if;

  -- Staff, or the creator whose video it is. Exactly the people who can already
  -- read the row.
  if v_actor.role::text not in ('admin', 'ops', 'ads_manager') and v_row.creator_id <> v_actor.id then
    raise exception 'not yours' using errcode = '42501';
  end if;

  update public.content_submissions
  set thumbnail_url = p_thumbnail_url,
      video_title = coalesce(p_video_title, video_title),
      video_author = coalesce(p_video_author, video_author),
      embed_id = coalesce(p_embed_id, embed_id)
  where id = p_content_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------------------- review_application --
-- Two changes, both role lists: an Ads Manager may review, and a review may
-- never touch ANY team account. The second list now names every non-creator
-- role we have, so approving a stray application from a Paid Collabs login
-- cannot quietly turn that person into a creator.
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

  select * into v_actor from public.profiles where id = p_actor_id;
  if not found then
    raise exception 'review_application: unknown reviewer' using errcode = '42501';
  end if;
  if v_actor.role::text not in ('ops', 'admin', 'ads_manager') or not v_actor.is_active then
    raise exception 'review_application: reviewer is not active staff'
      using errcode = '42501';
  end if;

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

  if v_target.role::text in (
       'ops', 'admin', 'ads_manager', 'creative_strategist',
       'affiliate_team_lead', 'operations_lead'
     ) then
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
    v_new_role := v_target.role;
    v_new_tier := v_target.tier;
  end if;

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

-- `create or replace` keeps each function's existing grants. Restated for the
-- two that are locked to the server, so nobody has to go and check.
revoke all on function public.review_application(uuid, public.application_status, uuid, public.creator_tier, text)
  from public, anon, authenticated;
grant execute on function public.review_application(uuid, public.application_status, uuid, public.creator_tier, text)
  to service_role;
revoke all on function public.refresh_content_preview(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.refresh_content_preview(uuid, uuid, text, text, text, text)
  to service_role;
