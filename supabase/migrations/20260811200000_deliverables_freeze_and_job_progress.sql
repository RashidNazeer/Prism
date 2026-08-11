/*
 * A job says how much of it has been filmed.
 *
 * Three things, and they belong together because the third is built on the
 * first two.
 *
 * 1. THE DELIVERABLE COUNT FREEZES AT APPROVAL, exactly as the reward already
 *    does. Rashid, 2026-08-11: "once we have approved, an admin should never be
 *    able to edit the number of deliverables". Approving a request is both
 *    sides agreeing a number of videos and an amount, so re-scoping the offer
 *    next week must not move the goalposts on somebody already filming, and
 *    must not change the database's own test for whether their job is done.
 *
 *    Note what does NOT freeze: the brand's budget. Approvals carry on adding
 *    to `budget_used` exactly as before. Editing an offer stays allowed; it
 *    just applies to whoever is approved next.
 *
 * 2. TWO WAYS A JOB COULD GET PERMANENTLY STUCK, both fixed.
 *
 *    a. `review_content` only carried a job to `content_completed` from
 *       `sample_shipped` or `content_pending`. Approve the last video while
 *       the job was still at `sample_requested` and it stuck forever: all five
 *       approved, stage still saying the sample was on its way, and no future
 *       approval could ever fix it because there were no videos left to
 *       approve. It now advances from any stage that has not reached content
 *       completed, and `set_offer_stage` re-checks on arrival, so moving a
 *       finished job to "content pending" no longer parks it there.
 *
 *    b. Nothing guarded the submission's PRIOR status, so flipping an approved
 *       video back to "needs another take" dropped the approved count below
 *       what was promised while the job stayed marked finished. It now walks
 *       the job back to `content_pending` and records why, so the creator is
 *       told rather than left to notice.
 *
 * 3. `job_progress`, THE PROJECT'S FIRST VIEW. One row per approved job: what
 *    was agreed, and how many videos are approved, waiting and sent back.
 *    FEATURE_MAP has said since day one that the project relies on "shared SQL
 *    views so every screen reads the same truth"; until now every cross-table
 *    number was assembled in a browser, which is why two screens could disagree.
 */

-- ============================================================================
-- 1. The deliverable count freezes at approval
-- ============================================================================

alter table public.offer_applications
  add column committed_video_count integer
    check (committed_video_count is null or committed_video_count > 0);

comment on column public.offer_applications.committed_video_count is
  'How many videos were agreed, snapshotted at approval alongside committed_amount. Never read live from the offer again: re-scoping an offer must not rewrite a promise already made. Null means the offer named no fixed number, so there is nothing to be short of.';

/*
 * Backfill. Everything already approved keeps the number its offer names
 * TODAY, because today is the only version of that offer we have. From here on
 * the snapshot is taken at the moment of approval and this can never drift
 * again.
 */
update public.offer_applications a
set committed_video_count = o.video_count
from public.offers o
where o.id = a.offer_id
  and a.status = 'approved'
  and a.committed_video_count is null
  and o.video_count is not null;

-- ------------------------------------------------- review_offer_application --
-- Unchanged except that it now snapshots the count beside the amount. The two
-- halves of the deal are read once, here, and kept.

create or replace function public.review_offer_application(
  p_actor_id uuid,
  p_application_id uuid,
  p_decision public.offer_application_status,
  p_note text default null,
  p_stage public.offer_stage default 'pending_request'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     public.profiles%rowtype;
  v_row       public.offer_applications%rowtype;
  v_offer     public.offers%rowtype;
  v_brand     public.brands%rowtype;
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_committed numeric := null;
  v_videos    integer := null;
  v_stage     public.offer_stage := null;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if p_decision not in ('approved', 'rejected') then
    raise exception 'a decision is approved or rejected' using errcode = '22023';
  end if;

  -- Locked for the whole transaction, so two admins clicking at once cannot
  -- both decide the same request, and cannot both spend the same budget.
  select * into v_row
  from public.offer_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'no such request' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'that was already %', v_row.status using errcode = '55006';
  end if;

  select * into v_offer from public.offers where id = v_row.offer_id;
  select * into v_brand from public.brands where id = v_row.brand_id;

  /*
   * Read the TERMS once, here, and keep them. The price is the number the
   * creator was promised and the number the budget is charged; the video count
   * is the number they agreed to film. Both must stay the same numbers forever
   * even if the offer is re-priced or re-scoped tomorrow.
   */
  if p_decision = 'approved' then
    v_committed := v_offer.reward_amount;
    v_videos    := v_offer.video_count;
    v_stage     := coalesce(p_stage, 'pending_request');
  end if;

  update public.offer_applications
  set status                = p_decision,
      decided_by            = v_actor.id,
      decided_at            = now(),
      decision_note         = v_note,
      committed_amount      = v_committed,
      committed_video_count = v_videos,
      stage                 = v_stage,
      stage_updated_at      = case when v_stage is null then null else now() end
  where id = p_application_id
  returning * into v_row;

  /*
   * Charge the brand. Only ever this brand: the request carries its own
   * brand_id, taken from the offer when it was made, so there is no way for an
   * approval to touch anybody else's money.
   *
   * An offer with no fixed fee commits nothing measurable, so it adds nothing
   * rather than adding a guessed number.
   */
  if p_decision = 'approved' and coalesce(v_committed, 0) > 0 then
    update public.brand_commercials
    set budget_used = budget_used + v_committed
    where brand_id = v_row.brand_id;
  end if;

  if p_decision = 'approved' then
    insert into public.offer_stage_events (
      application_id, creator_id, from_stage, to_stage, note, actor_id
    )
    values (v_row.id, v_row.creator_id, null, v_stage, v_note, v_actor.id);
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role,
    'offer_application.' || p_decision::text,
    'offer_application', v_row.id, v_row.creator_id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_row.brand_id,
      'offer', v_offer.title,
      'creator', v_row.creator_handle,
      'video_count', v_videos,
      'reward_amount', v_offer.reward_amount,
      'committed_amount', v_committed,
      'stage', v_stage::text,
      'currency', v_row.currency,
      'note', v_note
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 2. One place that answers "is this job finished?"
-- ============================================================================
/*
 * Extracted so the three callers cannot drift apart. It reads the SNAPSHOT on
 * the job, never the offer, and it counts only approved submissions, which is
 * the rule the whole content feature rests on.
 *
 * Not security definer on purpose: every caller is already a security definer
 * function that has checked who is asking. Adding another would widen the
 * surface for nothing.
 */
create or replace function public.job_is_filmed(p_application_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select a.committed_video_count is not null
     and (
       select count(*) from public.content_submissions c
       where c.application_id = a.id and c.status = 'approved'
     ) >= a.committed_video_count
  from public.offer_applications a
  where a.id = p_application_id;
$$;

comment on function public.job_is_filmed(uuid) is
  'Whether every video promised on this job has been approved. Reads the count snapshotted at approval, never the offer, and counts approved submissions only.';

-- The stages a job can still be carried FORWARD from. Past content_completed
-- the work is done and the money is moving, and dragging it back would undo a
-- payment decision somebody made on purpose.
create or replace function public.stage_is_before_content_done(p_stage public.offer_stage)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_stage in (
    'pending_request', 'sample_requested', 'sample_shipped', 'content_pending'
  );
$$;

-- ============================================================================
-- 3. review_content: finishing a job, and un-finishing one
-- ============================================================================

create or replace function public.review_content(
  p_actor_id uuid,
  p_content_id uuid,
  p_status public.content_status,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_row      public.content_submissions%rowtype;
  v_app      public.offer_applications%rowtype;
  v_offer    public.offers%rowtype;
  v_brand    public.brands%rowtype;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_was      public.content_status;
  v_from     public.offer_stage;
  v_advanced boolean := false;
  v_reopened boolean := false;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if p_status = 'submitted' then
    raise exception 'a review has to be a decision' using errcode = '22023';
  end if;

  select * into v_row from public.content_submissions
  where id = p_content_id for update;
  if not found then
    raise exception 'no such submission' using errcode = 'P0002';
  end if;

  -- What it was BEFORE we touched it. Needed to spot an approval being taken
  -- back, which is the case that used to leave a job marked finished with a
  -- video missing from it.
  v_was := v_row.status;

  update public.content_submissions
  set status = p_status,
      decision_note = v_note,
      decided_by = v_actor.id,
      decided_at = now()
  where id = p_content_id
  returning * into v_row;

  -- Lock the job for the rest of the transaction. Two admins approving the
  -- last two videos at once must not both decide it finished.
  select * into v_app from public.offer_applications
  where id = v_row.application_id for update;
  select * into v_offer from public.offers where id = v_row.offer_id;
  select * into v_brand from public.brands where id = v_row.brand_id;

  /*
   * HAS THIS FINISHED THE JOB?
   *
   * Only approved submissions count, and only when a number was agreed at
   * approval. A job with no fixed deliverable (a commission deal, say) can
   * never be "all filmed", so it stays where it is and a human moves it.
   *
   * It advances from ANY stage that has not reached content completed, not
   * just the two it used to. A creator whose sample was never marked shipped
   * still filmed the videos, and the old rule stranded that job forever.
   */
  if p_status = 'approved'
     and v_app.status = 'approved'
     and public.stage_is_before_content_done(v_app.stage)
     and public.job_is_filmed(v_app.id)
  then
    -- Captured before the update, or `returning` overwrites it and the history
    -- records a move from content completed to content completed.
    v_from := v_app.stage;

    update public.offer_applications
    set stage = 'content_completed', stage_updated_at = now()
    where id = v_app.id
    returning * into v_app;

    insert into public.offer_stage_events (
      application_id, creator_id, from_stage, to_stage, note, actor_id
    )
    values (
      v_app.id, v_app.creator_id, v_from, 'content_completed',
      'All ' || v_app.committed_video_count || ' videos are in and approved.',
      v_actor.id
    );
    v_advanced := true;

  /*
   * OR HAS IT UN-FINISHED ONE?
   *
   * Taking an approval back drops the count below what was promised. The job
   * was marked finished on the strength of that video, so it goes back to
   * content pending and the creator is told, rather than the screen quietly
   * disagreeing with itself.
   *
   * Only ever from content_completed. Past that a payment decision has been
   * made by a person and is not ours to reverse.
   */
  elsif v_was = 'approved' and p_status <> 'approved'
     and v_app.status = 'approved'
     and v_app.stage = 'content_completed'
     and not public.job_is_filmed(v_app.id)
  then
    update public.offer_applications
    set stage = 'content_pending', stage_updated_at = now()
    where id = v_app.id
    returning * into v_app;

    insert into public.offer_stage_events (
      application_id, creator_id, from_stage, to_stage, note, actor_id
    )
    values (
      v_app.id, v_app.creator_id, 'content_completed', 'content_pending',
      'One of the approved videos was sent back, so there is one still to come.',
      v_actor.id
    );
    v_reopened := true;
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'content.reviewed',
    'content_submission', v_row.id, v_row.creator_id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'offer', v_offer.title,
      'creator', v_row.creator_handle,
      'status', p_status::text,
      'was', v_was::text,
      'ad_code', v_row.ad_code,
      'note', v_note,
      'finished_the_job', v_advanced,
      'reopened_the_job', v_reopened
    ))
  );

  return jsonb_build_object(
    'submission', to_jsonb(v_row),
    'advanced', v_advanced,
    'reopened', v_reopened
  );
end;
$$;

-- --------------------------------------------------------- set_offer_stage --
/*
 * Re-check on arrival.
 *
 * Moving a job onto "content pending" when every video is already in and
 * approved used to park it there with nothing left to trigger the finish. The
 * check now runs wherever the job lands, so the pipeline cannot be walked into
 * a state the content already contradicts.
 *
 * Deliberately only forward, and only into content_completed. An admin moving
 * a job BACK to content pending on purpose, to ask for another video, is a
 * real thing to want; that is why this only fires when the videos say the job
 * is already complete.
 */
create or replace function public.set_offer_stage(
  p_actor_id uuid,
  p_application_id uuid,
  p_stage public.offer_stage,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.offer_applications%rowtype;
  v_offer public.offers%rowtype;
  v_brand public.brands%rowtype;
  v_from  public.offer_stage;
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_row
  from public.offer_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'no such request' using errcode = 'P0002';
  end if;
  if v_row.status <> 'approved' then
    raise exception 'only an approved request has a stage' using errcode = '22023';
  end if;

  v_from := v_row.stage;
  if v_from = p_stage then
    -- Not an error, just nothing to do. Saying so beats writing a history
    -- entry that records no change.
    return to_jsonb(v_row);
  end if;

  update public.offer_applications
  set stage = p_stage,
      stage_updated_at = now()
  where id = p_application_id
  returning * into v_row;

  insert into public.offer_stage_events (
    application_id, creator_id, from_stage, to_stage, note, actor_id
  )
  values (p_application_id, v_row.creator_id, v_from, p_stage, v_note, v_actor.id);

  select * into v_offer from public.offers where id = v_row.offer_id;
  select * into v_brand from public.brands where id = v_row.brand_id;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'offer_application.stage_changed',
    'offer_application', v_row.id, v_row.creator_id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'offer', v_offer.title,
      'creator', v_row.creator_handle,
      'from', v_from::text,
      'to', p_stage::text,
      'note', v_note
    ))
  );

  -- The videos already say this job is done. Land on it rather than beside it.
  if public.stage_is_before_content_done(p_stage) and public.job_is_filmed(v_row.id) then
    update public.offer_applications
    set stage = 'content_completed', stage_updated_at = now()
    where id = p_application_id
    returning * into v_row;

    insert into public.offer_stage_events (
      application_id, creator_id, from_stage, to_stage, note, actor_id
    )
    values (
      p_application_id, v_row.creator_id, p_stage, 'content_completed',
      'All ' || v_row.committed_video_count || ' videos are in and approved.',
      v_actor.id
    );
  end if;

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 4. job_progress: how much of one job has been filmed
-- ============================================================================
/*
 * SECURITY_INVOKER IS NOT OPTIONAL HERE, and it is the single most important
 * word in this file.
 *
 * A Postgres view runs as its OWNER by default, which would bypass row level
 * security on both tables underneath and hand every creator every other
 * creator's counts. With security_invoker the underlying policies still decide
 * the rows: a creator sees their own jobs and their own videos, staff see
 * everyone's, and there is one definition of the number rather than two.
 *
 * This is safe to share between both sides for one specific reason: A JOB
 * BELONGS TO EXACTLY ONE CREATOR, so a job level count is COMPLETE for that
 * creator rather than silently narrowed. That property does NOT hold one level
 * up. A creator counting the people on an offer gets back 1, their own row,
 * with no error at all, which is a wrong number that looks like a working
 * feature. Never build an offer level or brand level count this way.
 *
 * It carries no commercial column, so nothing here can leak a client name, an
 * allocation or a spend figure even if it is granted carelessly later.
 */
create view public.job_progress
with (security_invoker = true) as
select
  a.id                                                         as application_id,
  a.creator_id,
  a.brand_id,
  a.offer_id,
  a.committed_video_count                                      as required,
  count(c.id) filter (where c.status = 'approved')::int         as approved,
  count(c.id) filter (where c.status = 'submitted')::int        as waiting,
  count(c.id) filter (where c.status = 'needs_another_take')::int as needs_another_take,
  count(c.id)::int                                             as posted
from public.offer_applications a
left join public.content_submissions c on c.application_id = a.id
where a.status = 'approved'
group by a.id, a.creator_id, a.brand_id, a.offer_id, a.committed_video_count;

comment on view public.job_progress is
  'One row per approved job: what was agreed at approval, and how many videos are approved, waiting and sent back. security_invoker, so the tables underneath still decide who sees what. Job level only: an offer level count over these tables returns a creator their own row and calls it the total.';

-- "Automatically expose new tables" is off on both projects, which also
-- switches off the default grants to service_role. A view needs them spelled
-- out for exactly the same reason a table does.
grant select on public.job_progress to authenticated;
grant all privileges on table public.job_progress to service_role;

-- ============================================================================
-- 5. The indexes these counts need
-- ============================================================================

-- The view groups by job and filters by status. The existing index is
-- (application_id, created_at desc), which cannot serve that.
create index content_submissions_application_status_idx
  on public.content_submissions (application_id, status);

-- Counting approved videos on one job is what job_is_filmed does on EVERY
-- content approval, so it is worth its own partial index.
create index content_submissions_application_approved_idx
  on public.content_submissions (application_id)
  where status = 'approved';

/*
 * offer_id has been a foreign key with NO index at all since the table was
 * created. Every per-offer rollup was a sequential scan, and so was every
 * offer deletion, which has to check this table before it can proceed.
 */
create index content_submissions_offer_status_idx
  on public.content_submissions (offer_id, status);
