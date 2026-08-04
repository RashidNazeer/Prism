-- ============================================================================
-- The pipeline: what is actually happening on an approved offer.
-- ============================================================================
-- Approving somebody is the start of the work, not the end of it. A sample has
-- to be asked for, sent, filmed, delivered, and paid. Until now the product
-- went quiet at exactly the point a creator most wants to know where they
-- stand, which is the opposite of what this whole thing is for.
--
-- Seven stages, in Rashid's own words, and DELIBERATELY the same words on both
-- sides. An admin and a creator on the phone should be able to say "sample
-- shipped" and mean the same box. Two vocabularies for one pipeline is how you
-- get a support call.
--
-- Only approved requests have a stage. A pending one has not started and a
-- rejected one never will, so their stage is null rather than a first step
-- nobody is standing on.
--
-- Every move is recorded in `offer_stage_events`, and unlike `audit_log` the
-- creator can read their own. That is the point: they should be able to see
-- their sample was marked shipped on the third, without asking anyone.
-- ============================================================================

create type public.offer_stage as enum (
  'pending_request',
  'sample_requested',
  'sample_shipped',
  'content_pending',
  'content_completed',
  'payment_pending',
  'paid'
);

alter table public.offer_applications
  add column stage public.offer_stage,
  add column stage_updated_at timestamptz;

comment on column public.offer_applications.stage is
  'Where an approved request has got to. Null on anything not approved: a pending request has not started and a rejected one never will.';

-- Money follows the stage. Only `paid` has actually been handed over, and only
-- an approved request counts at all, so both indexes are partial.
create index offer_applications_stage_idx
  on public.offer_applications (stage)
  where status = 'approved';
create index offer_applications_creator_stage_idx
  on public.offer_applications (creator_id, stage)
  where status = 'approved';

-- --------------------------------------------------------------- events ---

create table public.offer_stage_events (
  id bigint generated always as identity primary key,

  application_id uuid not null
    references public.offer_applications (id) on delete cascade,

  /*
   * Denormalised from the request.
   *
   * The creator's read policy is `creator_id = auth.uid()`, and having it on
   * this row means that check never has to reach into another table, which
   * would drag that table's own policies in behind it.
   */
  creator_id uuid not null references public.profiles (id) on delete cascade,

  -- Null on the first event: nothing came before being approved.
  from_stage public.offer_stage,
  to_stage public.offer_stage not null,

  -- What the team wants the creator to know about this move. Optional, and
  -- creator facing, so nothing internal belongs in it.
  note text check (note is null or length(note) <= 500),

  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.offer_stage_events is
  'Every move through the pipeline. Creator readable for their own work, which is what makes the timeline on their dashboard possible.';

create index offer_stage_events_application_idx
  on public.offer_stage_events (application_id, created_at desc);
create index offer_stage_events_creator_idx
  on public.offer_stage_events (creator_id, created_at desc);

-- ----------------------------------------------------------- row security --

alter table public.offer_stage_events enable row level security;

create policy "offer_stage_events_select_staff"
  on public.offer_stage_events for select to authenticated
  using (public.is_staff());

create policy "offer_stage_events_select_own"
  on public.offer_stage_events for select to authenticated
  using (creator_id = (select auth.uid()));

-- No insert, update or delete policy. Every write goes through the functions
-- below, the same as everything else that decides money.

grant select on public.offer_stage_events to authenticated;
grant all privileges on table public.offer_stage_events to service_role;

-- A stage change has to land on the creator's screen while they are looking at
-- it, for the same reason an approval does.
alter publication supabase_realtime add table public.offer_stage_events;
alter table public.offer_stage_events replica identity full;

-- ------------------------------------------------------------- backfill ---
-- Anything already approved is at the start of the pipeline, not outside it.

update public.offer_applications
set stage = 'pending_request',
    stage_updated_at = coalesce(decided_at, updated_at)
where status = 'approved' and stage is null;

insert into public.offer_stage_events (application_id, creator_id, to_stage, actor_id, created_at)
select a.id, a.creator_id, 'pending_request', a.decided_by, coalesce(a.decided_at, a.updated_at)
from public.offer_applications a
where a.status = 'approved'
  and not exists (
    select 1 from public.offer_stage_events e where e.application_id = a.id
  );

-- ============================================================================
-- Writes
-- ============================================================================

-- ------------------------------------------------------- set_offer_stage ---
-- Moving a request along. Backwards is allowed on purpose: a sample marked
-- shipped that was not shipped has to be correctable, and refusing would only
-- teach people to work around the product.

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
      'amount', v_row.committed_amount,
      'currency', v_row.currency,
      'note', v_note
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------------ review, now with a stage --
-- Approving puts a request into the pipeline. The starting stage is usually
-- the first one, but a sample already in the post is a real situation and
-- making somebody approve then immediately correct it is busywork.

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

  -- Read the price ONCE, here, and keep it. This is the number the creator was
  -- promised and the number the budget is charged, and they must stay the same
  -- number forever even if the offer is re-priced tomorrow.
  if p_decision = 'approved' then
    v_committed := v_offer.reward_amount;
    v_stage := coalesce(p_stage, 'pending_request');
  end if;

  update public.offer_applications
  set status           = p_decision,
      decided_by       = v_actor.id,
      decided_at       = now(),
      decision_note    = v_note,
      committed_amount = v_committed,
      stage            = v_stage,
      stage_updated_at = case when v_stage is null then null else now() end
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
      'video_count', v_offer.video_count,
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

-- ----------------------------------------------------------------- locks ---

revoke all on function
  public.set_offer_stage(uuid, uuid, public.offer_stage, text)
  from public, anon, authenticated;
grant execute on function
  public.set_offer_stage(uuid, uuid, public.offer_stage, text) to service_role;

-- The old four-argument signature is gone: leaving it would leave a second way
-- in that cannot set a stage, and callers would silently get the wrong one.
drop function if exists public.review_offer_application(
  uuid, uuid, public.offer_application_status, text
);

revoke all on function public.review_offer_application(
  uuid, uuid, public.offer_application_status, text, public.offer_stage
) from public, anon, authenticated;
grant execute on function public.review_offer_application(
  uuid, uuid, public.offer_application_status, text, public.offer_stage
) to service_role;
