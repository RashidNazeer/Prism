-- ============================================================================
-- TWO RULES THE PRODUCT ALREADY BELIEVED IT HAD, 2026-08-19
--
-- Rashid, walking the whole flow: "make sure creators are only be shown these
-- gmv stats for the videos that are approved by admin", and "when creators have
-- uploaded all the videos they committed they and all are approved,
-- automatically their stauts should be go to payment pending".
--
-- Neither was true. This migration makes both true.
--
--
-- 1. THE MONEY PATH NEVER ASKED WHETHER A VIDEO WAS APPROVED.
--
-- `content_submissions` has said since the day it was created that "a
-- submission counts for nothing until an admin approves it", and the
-- deliverable count has always obeyed that (`job_is_filmed` counts approved
-- rows only). The ad-money path, built a week later, never picked the rule up.
-- Every read function and the row policy on `tiktok_video_daily` matched on
-- ownership alone.
--
-- What that actually meant, in order of cost:
--
--   a. A video's GMV appeared on a creator's screen BEFORE anybody watched it.
--      The only gate was `ad_authorized`, which is a checkbox the creator
--      ticks themselves and which the table's own comment admits "we cannot
--      check from here".
--   b. A video sent back for a retake KEPT its money on the creator's screen,
--      for ever. Nothing removes it and nothing hides it.
--   c. The sharp one. There is no uniqueness on `embed_id` or on
--      `video_url` across creators, and `update_content` lets a creator
--      rewrite the link on a row that has not been approved yet. So pasting
--      another creator's TikTok URL for the same brand into an unreviewed
--      submission made the nightly sync fetch THAT video's real spend and GMV
--      and handed it over as theirs. Approval is the lock that closes it: a
--      human looks at the video before its money is anybody's.
--
-- The gate goes on all five places at once, deliberately. A read function
-- filtered while the policy was not would still leak through any other query,
-- and a policy filtered while the sync was not would keep paying TikTok for
-- videos nobody had agreed to.
--
--
-- 2. FINISHING A JOB LEFT THE MONEY IN THE WRONG BUCKET.
--
-- Approving the last video advanced a job to `content_completed`. That stage
-- is in the `working` money bucket, so a creator who had filmed everything and
-- had every video approved still read "Your content is in and being checked"
-- and still saw their fee counted as In progress rather than Awaiting payment.
-- Nothing moved it but a human changing a dropdown, and no admin tile counted
-- jobs sitting there, so a finished job had no queue at all: it waited to be
-- noticed.
--
-- It advances to `payment_pending` now. That is a claim about US, not about
-- the creator: the work is in, we owe them, and `paid` is still a decision a
-- person makes with money in their hand. Nothing about approving a payment has
-- become automatic.
--
-- `content_completed` stays in the enum and stays selectable. An admin who
-- wants a finished job to wait there can still put it there by hand, and
-- neither function will snap it forward, because that stage is not "before
-- content done".
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1a. The row policy. This is the one that matters: it is the floor every
--     other query in the product stands on, including any written later.
-- ----------------------------------------------------------------------------

drop policy if exists "tiktok_video_daily_select_own" on public.tiktok_video_daily;

create policy "tiktok_video_daily_select_own"
  on public.tiktok_video_daily
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.content_submissions cs
      where cs.embed_id = tiktok_video_daily.item_id
        and cs.creator_id = (select auth.uid())
        and cs.status = 'approved'
    )
  );

comment on policy "tiktok_video_daily_select_own" on public.tiktok_video_daily is
  'A creator reads the figures for their own APPROVED videos and nothing else. Ownership alone is not enough: a link is a claim until somebody has watched it, and until then its money is not theirs to read.';


-- ----------------------------------------------------------------------------
-- 1b. The three read functions. Same columns, so create or replace is enough.
-- ----------------------------------------------------------------------------

create or replace function public.creator_performance_window()
returns table (
  earliest date,
  latest date,
  videos integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    min(coalesce(public.tiktok_posted_at(cs.embed_id), cs.created_at))::date as earliest,
    max(d.stat_date)                                                        as latest,
    count(distinct cs.embed_id)::integer                                    as videos
  from public.content_submissions cs
  left join public.tiktok_video_daily d on d.item_id = cs.embed_id
  where cs.creator_id = (select auth.uid())
    and cs.embed_id is not null
    and cs.status = 'approved';
$$;

create or replace function public.creator_daily_performance(p_from date, p_to date)
returns table (
  stat_date date,
  cost numeric,
  gross_revenue numeric,
  orders bigint,
  videos integer,
  currency text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.stat_date,
    sum(d.cost)                     as cost,
    sum(d.gross_revenue)            as gross_revenue,
    sum(d.orders)                   as orders,
    count(distinct d.item_id)::integer as videos,
    max(d.currency)                 as currency
  from public.tiktok_video_daily d
  where d.stat_date between p_from and p_to
    and exists (
      select 1 from public.content_submissions cs
      where cs.embed_id = d.item_id
        and cs.creator_id = (select auth.uid())
        and cs.status = 'approved'
    )
  group by d.stat_date
  order by d.stat_date;
$$;

/*
 * ONE ROW PER VIDEO, NOT PER SUBMISSION, and that is a change.
 *
 * `mine` used to select `cs.id` per submission row. The unique on that table
 * is (application_id, video_url), so the SAME video filed against two jobs
 * produced two rows, each carrying the video's FULL money, and MyNumbers sums
 * those rows into the four tiles. The chart underneath aggregates
 * tiktok_video_daily directly and does not double count, so the tiles and the
 * chart could quietly disagree. React would also have warned on the duplicate
 * key.
 *
 * `distinct on (cs.embed_id)` collapses them, keeping the earliest submission,
 * which is the one whose date the card should show. Invisible today and
 * unavoidable the moment anything sums across creators, which the leaderboard
 * will.
 */
create or replace function public.creator_video_performance(p_from date, p_to date)
returns table (
  item_id text,
  submission_id uuid,
  video_url text,
  video_title text,
  thumbnail_url text,
  brand_id uuid,
  brand_name text,
  submitted_at timestamptz,
  cost numeric,
  gross_revenue numeric,
  orders bigint,
  roi numeric,
  cost_per_order numeric,
  currency text,
  days_with_data integer,
  ads_ever boolean,
  last_active_date date,
  lifetime_cost numeric,
  lifetime_revenue numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select distinct on (cs.embed_id)
           cs.id, cs.embed_id, cs.video_url, cs.video_title, cs.thumbnail_url,
           cs.brand_id, cs.created_at
    from public.content_submissions cs
    where cs.creator_id = (select auth.uid())
      and cs.embed_id is not null
      and cs.status = 'approved'
    order by cs.embed_id, cs.created_at
  ),
  lifetime as (
    select d.item_id,
           sum(d.cost)          as cost,
           sum(d.gross_revenue) as revenue,
           max(d.stat_date) filter (where d.cost > 0) as last_active,
           bool_or(d.cost > 0)  as ads_ever
    from public.tiktok_video_daily d
    where d.item_id in (select embed_id from mine)
    group by d.item_id
  ),
  ranged as (
    select d.item_id,
           sum(d.cost)          as cost,
           sum(d.gross_revenue) as revenue,
           sum(d.orders)        as orders,
           max(d.currency)      as currency,
           count(*)::integer    as days
    from public.tiktok_video_daily d
    where d.item_id in (select embed_id from mine)
      and d.stat_date between p_from and p_to
    group by d.item_id
  )
  select
    m.embed_id                                as item_id,
    m.id                                      as submission_id,
    m.video_url,
    m.video_title,
    m.thumbnail_url,
    m.brand_id,
    b.name                                    as brand_name,
    m.created_at                              as submitted_at,
    coalesce(r.cost, 0)                       as cost,
    coalesce(r.revenue, 0)                    as gross_revenue,
    coalesce(r.orders, 0)                     as orders,
    round(coalesce(r.revenue, 0) / nullif(r.cost, 0), 2)  as roi,
    round(coalesce(r.cost, 0) / nullif(r.orders, 0), 2)   as cost_per_order,
    r.currency,
    coalesce(r.days, 0)                       as days_with_data,
    coalesce(l.ads_ever, false)               as ads_ever,
    l.last_active                             as last_active_date,
    coalesce(l.cost, 0)                       as lifetime_cost,
    coalesce(l.revenue, 0)                    as lifetime_revenue
  from mine m
  left join public.brands b on b.id = m.brand_id
  left join lifetime l on l.item_id = m.embed_id
  left join ranged   r on r.item_id = m.embed_id
  order by coalesce(r.revenue, 0) desc, m.created_at desc;
$$;


-- ----------------------------------------------------------------------------
-- 1c. The backfill depth. Without this, an unapproved video would still drag
--     the sync back weeks and spend calls on figures nobody may read.
-- ----------------------------------------------------------------------------

create or replace function public.tiktok_days_to_backfill()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    max(
      extract(day from (now() - coalesce(public.tiktok_posted_at(cs.embed_id), cs.created_at)))::integer
    ),
    0
  )
  from public.content_submissions cs
  join public.tiktok_stores s
    on s.brand_id = cs.brand_id and s.brand_id is not null
  where cs.embed_id is not null
    and cs.ad_authorized
    and cs.status = 'approved'
    and not exists (
      select 1 from public.tiktok_video_daily d where d.item_id = cs.embed_id
    );
$$;


-- ----------------------------------------------------------------------------
-- 2. The finished job lands on payment_pending.
-- ----------------------------------------------------------------------------

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
    set stage = 'payment_pending', stage_updated_at = now()
    where id = v_app.id
    returning * into v_app;

    insert into public.offer_stage_events (
      application_id, creator_id, from_stage, to_stage, note, actor_id
    )
    values (
      v_app.id, v_app.creator_id, v_from, 'payment_pending',
      'All ' || v_app.committed_video_count ||
        ' videos are in and approved. Your payment is being arranged.',
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
   * From content_completed OR payment_pending, because since 2026-08-19 the
   * approval itself is what puts a job into payment_pending: it is no longer a
   * decision a person made, so walking it back undoes nothing of theirs.
   * NEVER from paid. Somebody has sent money.
   */
  elsif v_was = 'approved' and p_status <> 'approved'
     and v_app.status = 'approved'
     and v_app.stage in ('content_completed', 'payment_pending')
     and not public.job_is_filmed(v_app.id)
  then
    v_from := v_app.stage;

    update public.offer_applications
    set stage = 'content_pending', stage_updated_at = now()
    where id = v_app.id
    returning * into v_app;

    insert into public.offer_stage_events (
      application_id, creator_id, from_stage, to_stage, note, actor_id
    )
    values (
      v_app.id, v_app.creator_id, v_from, 'content_pending',
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
  --
  -- The target is payment_pending, matching review_content. An admin who wants
  -- a filmed job to sit at Content completed can still pick it by hand: that
  -- stage is not "before content done", so it is never snapped past.
  if public.stage_is_before_content_done(p_stage) and public.job_is_filmed(v_row.id) then
    update public.offer_applications
    set stage = 'payment_pending', stage_updated_at = now()
    where id = p_application_id
    returning * into v_row;

    insert into public.offer_stage_events (
      application_id, creator_id, from_stage, to_stage, note, actor_id
    )
    values (
      p_application_id, v_row.creator_id, p_stage, 'payment_pending',
      'All ' || v_row.committed_video_count ||
        ' videos are in and approved. Your payment is being arranged.',
      v_actor.id
    );
  end if;

  return to_jsonb(v_row);
end;
$$;

comment on function public.review_content(uuid, uuid, public.content_status, text) is
  'Staff approve a video or send it back. Approving the last one carries the job to payment_pending in the same transaction; taking an approval back walks it out again, from content_completed or payment_pending but never from paid.';
