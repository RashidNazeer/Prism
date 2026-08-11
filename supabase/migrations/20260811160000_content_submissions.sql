/*
 * Content: the videos a creator actually films, and the codes that let us run
 * ads behind them.
 *
 * "Content pending" was the one stage in the pipeline with nothing to do in it.
 * A creator was told to film and then had nowhere to put the result, so the
 * only way a video reached us was outside the product entirely.
 *
 * We store a LINK, never a file. These are TikTok posts; they live on TikTok,
 * and the platform's own oEmbed gives us a thumbnail and a player without a
 * byte of video passing through us.
 *
 * A submission counts for nothing until an admin approves it. That is Rashid's
 * call and it is the right one: a link pasted into a form is a claim, and only
 * a person who has watched the video knows whether the job is really done. So
 * `approve_content` is also the only thing that can carry a job to
 * "content completed", and it does that in the same transaction as the
 * approval.
 */

-- ============================================================================
-- Vocabulary
-- ============================================================================

create type public.content_status as enum (
  'submitted',           -- with the team
  'approved',            -- watched, counted, done
  'needs_another_take'   -- sent back with a reason the creator reads
);

-- ============================================================================
-- Table
-- ============================================================================

create table public.content_submissions (
  id uuid primary key default gen_random_uuid(),

  /*
   * The JOB it belongs to, not just the offer.
   *
   * "Five videos for $300" is a promise made to one creator on one request, so
   * "how many are still to come" is only answerable against that request. An
   * offer_id alone would count a second creator's videos towards the first
   * creator's total.
   */
  application_id uuid not null
    references public.offer_applications (id) on delete cascade,

  creator_id uuid not null references public.profiles (id) on delete cascade,

  -- Denormalised so the admin screen can filter by brand without a join, the
  -- same reason offer_applications carries them.
  brand_id uuid not null references public.brands (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,

  -- Who they were when they posted it. Snapshotted like everywhere else, so
  -- the queue still reads correctly after a rename.
  creator_handle text,
  creator_name text,

  video_url text not null
    check (video_url ~* '^https://' and length(video_url) between 12 and 2048),

  /*
   * The ad authorisation code for this video. One code, one video.
   *
   * Deliberately just "ad code" everywhere a creator sees it. They know what
   * it is; the product does not need to explain itself on every card.
   */
  ad_code text not null check (length(trim(ad_code)) between 3 and 120),

  -- The creator confirming the code is authorised at their end. We cannot
  -- check that from here, so it is their statement, recorded as theirs.
  ad_authorized boolean not null default false,

  status public.content_status not null default 'submitted',

  -- Why it came back. Creator facing, so nothing internal belongs in it.
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,

  -- Fetched server side from the platform's oEmbed when it is submitted.
  -- All nullable: TikTok being slow must never cost a creator their upload.
  thumbnail_url text,
  video_title text,
  video_author text,
  embed_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The same link twice against one job is a mis-paste, not two videos.
  unique (application_id, video_url)
);

comment on table public.content_submissions is
  'Video links and ad codes a creator posts against one approved job. Approved submissions are the ones that count towards the offer.';

create index content_submissions_creator_idx
  on public.content_submissions (creator_id, created_at desc);
create index content_submissions_application_idx
  on public.content_submissions (application_id, created_at desc);
create index content_submissions_brand_idx
  on public.content_submissions (brand_id, created_at desc);
create index content_submissions_status_idx
  on public.content_submissions (status, created_at desc);
-- The admin queue searches by handle and by ad code, both partial.
create index content_submissions_handle_trgm_idx
  on public.content_submissions using gin (creator_handle extensions.gin_trgm_ops);
create index content_submissions_ad_code_trgm_idx
  on public.content_submissions using gin (ad_code extensions.gin_trgm_ops);

create trigger content_submissions_touch_updated_at
  before update on public.content_submissions
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------- row security --

alter table public.content_submissions enable row level security;

create policy "content_submissions_select_staff"
  on public.content_submissions for select to authenticated
  using (public.is_staff());

create policy "content_submissions_select_own"
  on public.content_submissions for select to authenticated
  using (creator_id = (select auth.uid()));

-- No insert, update or delete policy, on purpose. Every write goes through the
-- functions below and the Edge Function in front of them, exactly like
-- offer_applications. This is the second thing in the product a creator can
-- write, and it decides whether a job is finished.

grant select on public.content_submissions to authenticated;
grant all privileges on table public.content_submissions to service_role;

-- An approval has to land on the creator's screen while they are looking at
-- it, and a new upload on the admin's, for the same reason a stage change does.
alter publication supabase_realtime add table public.content_submissions;
alter table public.content_submissions replica identity full;

-- ============================================================================
-- Writes
-- ============================================================================

-- ------------------------------------------------------- submit_content ---
-- A creator posting a video against their own job.

create or replace function public.submit_content(
  p_actor_id uuid,
  p_application_id uuid,
  p_video_url text,
  p_ad_code text,
  p_ad_authorized boolean default false,
  p_thumbnail_url text default null,
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
  v_app   public.offer_applications%rowtype;
  v_row   public.content_submissions%rowtype;
begin
  v_actor := public.assert_active_creator(p_actor_id);

  /*
   * Matched on creator_id as well as the id.
   *
   * Without that, a creator who knows somebody else's application id could
   * post videos onto their job. Same rule as withdraw_offer_application, and
   * the suite proves it with a second, rival creator.
   */
  select * into v_app
  from public.offer_applications
  where id = p_application_id and creator_id = v_actor.id
  for update;

  if not found then
    raise exception 'that is not one of your jobs' using errcode = '42501';
  end if;
  if v_app.status <> 'approved' then
    raise exception 'you can only post content against work you are on'
      using errcode = '22023';
  end if;

  insert into public.content_submissions (
    application_id, creator_id, brand_id, offer_id,
    creator_handle, creator_name,
    video_url, ad_code, ad_authorized,
    thumbnail_url, video_title, video_author, embed_id
  )
  values (
    v_app.id, v_actor.id, v_app.brand_id, v_app.offer_id,
    v_app.creator_handle, v_app.creator_name,
    trim(p_video_url), trim(p_ad_code), coalesce(p_ad_authorized, false),
    p_thumbnail_url, p_video_title, p_video_author, p_embed_id
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------------------- update_content ---
-- Fixing a wrong link or a typo'd code, while it is still with the team.

create or replace function public.update_content(
  p_actor_id uuid,
  p_content_id uuid,
  p_video_url text,
  p_ad_code text,
  p_ad_authorized boolean default false,
  p_thumbnail_url text default null,
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
  v_actor := public.assert_active_creator(p_actor_id);

  select * into v_row
  from public.content_submissions
  where id = p_content_id and creator_id = v_actor.id
  for update;

  if not found then
    raise exception 'no such submission' using errcode = 'P0002';
  end if;

  /*
   * Locked once a person has acted on it.
   *
   * An approved video that could still be swapped out would mean the thing we
   * checked and the thing on the record are different videos, which is exactly
   * what approval is supposed to rule out.
   */
  if v_row.status = 'approved' then
    raise exception 'that one is approved, so it cannot be changed now'
      using errcode = '22023';
  end if;

  update public.content_submissions
  set video_url = trim(p_video_url),
      ad_code = trim(p_ad_code),
      ad_authorized = coalesce(p_ad_authorized, false),
      thumbnail_url = p_thumbnail_url,
      video_title = p_video_title,
      video_author = p_video_author,
      embed_id = p_embed_id,
      -- Re-posting after a knock-back puts it back with the team, otherwise a
      -- fixed video would sit under its old rejection for ever.
      status = 'submitted',
      decision_note = null,
      decided_by = null,
      decided_at = null
  where id = p_content_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------------------- delete_content ---

create or replace function public.delete_content(p_actor_id uuid, p_content_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.content_submissions%rowtype;
begin
  v_actor := public.assert_active_creator(p_actor_id);

  select * into v_row
  from public.content_submissions
  where id = p_content_id and creator_id = v_actor.id
  for update;

  if not found then
    raise exception 'no such submission' using errcode = 'P0002';
  end if;
  if v_row.status = 'approved' then
    raise exception 'that one is approved, so it cannot be removed now'
      using errcode = '22023';
  end if;

  delete from public.content_submissions where id = p_content_id;
  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------------------- review_content ---
/*
 * The team watching a video and deciding.
 *
 * This is the only thing that can finish a job. When the last video an offer
 * asked for is approved, the request moves to "content completed" in this same
 * transaction, with a stage event the creator can read. Uploading does not do
 * that, and should not: a link is a claim until somebody has watched it.
 */

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
  v_approved integer;
  v_advanced boolean := false;
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

  update public.content_submissions
  set status = p_status,
      decision_note = v_note,
      decided_by = v_actor.id,
      decided_at = now()
  where id = p_content_id
  returning * into v_row;

  select * into v_app from public.offer_applications
  where id = v_row.application_id for update;
  select * into v_offer from public.offers where id = v_row.offer_id;
  select * into v_brand from public.brands where id = v_row.brand_id;

  /*
   * Has this finished the job?
   *
   * Only counts APPROVED submissions, and only when the offer names a number.
   * An offer with no fixed deliverable (a boosted commission rate, say) can
   * never be "all uploaded", so it stays where it is and a human moves it.
   */
  if p_status = 'approved'
     and v_offer.video_count is not null
     and v_app.status = 'approved'
     and v_app.stage in ('sample_shipped', 'content_pending')
  then
    select count(*) into v_approved
    from public.content_submissions
    where application_id = v_app.id and status = 'approved';

    if v_approved >= v_offer.video_count then
      update public.offer_applications
      set stage = 'content_completed', stage_updated_at = now()
      where id = v_app.id
      returning * into v_app;

      insert into public.offer_stage_events (
        application_id, creator_id, from_stage, to_stage, note, actor_id
      )
      values (
        v_app.id, v_app.creator_id, 'content_pending', 'content_completed',
        'All ' || v_offer.video_count || ' videos are in and approved.',
        v_actor.id
      );
      v_advanced := true;
    end if;
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
      'ad_code', v_row.ad_code,
      'note', v_note,
      'finished_the_job', v_advanced
    ))
  );

  return jsonb_build_object('submission', to_jsonb(v_row), 'advanced', v_advanced);
end;
$$;

revoke all on function public.submit_content(uuid, uuid, text, text, boolean, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_content(uuid, uuid, text, text, boolean, text, text, text, text) from public, anon, authenticated;
revoke all on function public.delete_content(uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_content(uuid, uuid, public.content_status, text) from public, anon, authenticated;
