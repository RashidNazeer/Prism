-- ============================================================================
-- Step 6, part three: creators apply for offers, and staff decide.
-- ============================================================================
-- Two things a creator can do with an offer that needs an application:
--
--   take it as written        apply with the brand's own terms
--   counter it                name their own video count and their own price
--
-- The second is the "custom offer" Rashid described: a creator says what they
-- will do and what they want for it, and an admin says yes or no. It is the
-- same row either way, which is why there is one table and not two. An offer
-- with no fixed terms at all can ONLY be countered, because there is nothing to
-- accept.
--
-- Offers that do not need an application are not in here at all. Those are
-- already the creator's, so there is nothing to ask for and nothing to decide.
--
-- Same shape as everything else in the hub: no write policies, one Edge
-- Function door, security definer functions that write the row and its audit
-- entry in the same transaction.
-- ============================================================================

create type public.offer_application_status as enum (
  'pending',
  'approved',
  'rejected',
  -- The creator changed their mind before anyone decided. Kept rather than
  -- deleted, so "they applied and pulled out" is still answerable.
  'withdrawn'
);

create table public.offer_applications (
  id uuid primary key default gen_random_uuid(),

  -- Cascades. A request for an offer that no longer exists means nothing, and
  -- the audit log keeps the record of what it was. `delete_offer` refuses
  -- outright while anything here is pending or approved, so this cascade only
  -- ever sweeps up settled rows.
  offer_id uuid not null references public.offers (id) on delete cascade,

  -- Denormalised from the offer so the admin queue can filter by brand without
  -- a join, and so a row still says which brand it belonged to.
  brand_id uuid not null references public.brands (id) on delete cascade,

  creator_id uuid not null references public.profiles (id) on delete cascade,

  /*
   * Who they were when they applied.
   *
   * Snapshotted for the same reason `audit_log` snapshots the actor: the queue
   * has to still make sense later, and searching by name should not mean
   * joining three tables and a trigram index across them. The live profile is
   * still embedded for display; these are for filtering and for history.
   */
  creator_handle text,
  creator_name text,
  creator_email text,

  status public.offer_application_status not null default 'pending',

  /*
   * What they are asking for. Null on both means "as offered".
   *
   * Nullable rather than copied from the offer, because "they accepted our
   * terms" and "they happened to name our exact numbers" are different facts,
   * and only the first one stays true if the offer is later edited.
   */
  proposed_video_count integer
    check (proposed_video_count is null or proposed_video_count between 1 and 1000),
  proposed_amount numeric(12, 2)
    check (proposed_amount is null or proposed_amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  -- The creator's pitch. Optional.
  note text check (note is null or length(note) <= 1000),

  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  -- What the admin said back. The creator reads this.
  decision_note text check (decision_note is null or length(decision_note) <= 1000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.offer_applications is
  'A creator asking for an offer, either as written or on their own terms. Staff approve or reject.';

/*
 * One live request per creator per offer.
 *
 * Partial, not a plain unique constraint: somebody rejected in March should be
 * able to ask again in June, and somebody who withdrew should be able to change
 * their mind. What must not happen is two open requests for the same offer.
 */
create unique index offer_applications_one_open_idx
  on public.offer_applications (offer_id, creator_id)
  where status in ('pending', 'approved');

create index offer_applications_queue_idx
  on public.offer_applications (status, created_at desc);
create index offer_applications_brand_idx
  on public.offer_applications (brand_id, status);
create index offer_applications_creator_idx
  on public.offer_applications (creator_id, created_at desc);
create index offer_applications_offer_idx
  on public.offer_applications (offer_id);
-- Substring search on the queue, the same trigram approach the application
-- queue uses.
create index offer_applications_handle_trgm_idx
  on public.offer_applications using gin (creator_handle extensions.gin_trgm_ops);

create trigger offer_applications_touch_updated_at
  before update on public.offer_applications
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------- row security --

alter table public.offer_applications enable row level security;

-- Staff read the queue.
create policy "offer_applications_select_staff"
  on public.offer_applications for select to authenticated
  using (public.is_staff());

-- A creator reads their own, and only their own. No policy lets anybody see
-- what another creator asked for, or what they were paid.
create policy "offer_applications_select_own"
  on public.offer_applications for select to authenticated
  using (creator_id = (select auth.uid()));

-- No insert, update or delete policy, on purpose. Every write goes through the
-- functions below.

grant select on public.offer_applications to authenticated;
grant all privileges on table public.offer_applications to service_role;

-- A decision has to land on the creator's screen while they are looking at it.
-- Row level security applies to realtime too, so a creator is only ever told
-- about their own row.
alter publication supabase_realtime add table public.offer_applications;
alter table public.offer_applications replica identity full;

-- ============================================================================
-- Writes
-- ============================================================================

-- The creator equivalent of `assert_active_staff`. Reads the profiles table
-- rather than the JWT, so approval takes effect immediately.
create or replace function public.assert_active_creator(p_actor_id uuid)
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
  if v_actor.role <> 'creator' or not v_actor.is_active then
    raise exception 'that account is not an active creator' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

-- -------------------------------------------------------- apply_for_offer ---

create or replace function public.apply_for_offer(
  p_actor_id uuid,
  p_offer_id uuid,
  p_video_count integer default null,
  p_amount numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_offer   public.offers%rowtype;
  v_brand   public.brands%rowtype;
  v_row     public.offer_applications%rowtype;
  v_handle  text;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
  v_fixed   boolean;
begin
  v_actor := public.assert_active_creator(p_actor_id);

  select * into v_offer from public.offers where id = p_offer_id;
  if not found then
    raise exception 'no such offer' using errcode = 'P0002';
  end if;
  if v_offer.status <> 'active' then
    raise exception 'that offer is not open' using errcode = '22023';
  end if;

  select * into v_brand from public.brands where id = v_offer.brand_id;
  if not found or not v_brand.is_active then
    raise exception 'that brand is not open' using errcode = '22023';
  end if;

  if not v_offer.needs_application then
    raise exception 'that offer is already yours, there is nothing to apply for'
      using errcode = '22023';
  end if;

  -- An offer with no fixed terms can only be countered: there is nothing to
  -- accept, so the creator has to say what they will do and what they want.
  v_fixed := v_offer.video_count is not null and v_offer.reward_amount is not null;
  if not v_fixed and (p_video_count is null or p_amount is null) then
    raise exception 'this offer has no set terms, so tell us your videos and your price'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.offer_applications a
    where a.offer_id = p_offer_id
      and a.creator_id = v_actor.id
      and a.status in ('pending', 'approved')
  ) then
    raise exception 'you have already asked for this one' using errcode = '55006';
  end if;

  select a.tiktok_handle into v_handle
  from public.applications a
  where a.user_id = v_actor.id
  order by a.created_at desc
  limit 1;

  insert into public.offer_applications (
    offer_id, brand_id, creator_id, creator_handle, creator_name, creator_email,
    proposed_video_count, proposed_amount, currency, note
  )
  values (
    p_offer_id, v_offer.brand_id, v_actor.id, v_handle, v_actor.display_name,
    v_actor.email, p_video_count, p_amount, v_offer.currency, v_note
  )
  returning * into v_row;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'offer_application.created',
    'offer_application', v_row.id, v_actor.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'offer', v_offer.title,
      'offer_id', v_offer.id,
      'proposed_video_count', v_row.proposed_video_count,
      'proposed_amount', v_row.proposed_amount,
      'currency', v_row.currency
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------- withdraw_offer_application ---

create or replace function public.withdraw_offer_application(
  p_actor_id uuid,
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.offer_applications%rowtype;
begin
  v_actor := public.assert_active_creator(p_actor_id);

  -- Locked, and matched on the creator too: this is the one write a creator
  -- can make, so it must be impossible to aim it at somebody else's row.
  select * into v_row
  from public.offer_applications
  where id = p_application_id and creator_id = v_actor.id
  for update;

  if not found then
    raise exception 'no such request' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'that has already been decided' using errcode = '55006';
  end if;

  update public.offer_applications
  set status = 'withdrawn'
  where id = p_application_id
  returning * into v_row;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'offer_application.withdrawn',
    'offer_application', v_row.id, v_actor.id, jsonb_build_object('offer_id', v_row.offer_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------------ review_offer_application ---

create or replace function public.review_offer_application(
  p_actor_id uuid,
  p_application_id uuid,
  p_decision public.offer_application_status,
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
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if p_decision not in ('approved', 'rejected') then
    raise exception 'a decision is approved or rejected' using errcode = '22023';
  end if;

  -- Locked for the whole transaction, so two admins clicking at once cannot
  -- both decide the same request.
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

  update public.offer_applications
  set status        = p_decision,
      decided_by    = v_actor.id,
      decided_at    = now(),
      decision_note = v_note
  where id = p_application_id
  returning * into v_row;

  select * into v_offer from public.offers where id = v_row.offer_id;
  select * into v_brand from public.brands where id = v_row.brand_id;

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
      'offer', v_offer.title,
      'creator', v_row.creator_handle,
      'proposed_video_count', v_row.proposed_video_count,
      'proposed_amount', v_row.proposed_amount,
      'currency', v_row.currency,
      'note', v_note
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------------------ delete_offer, again ---
-- An offer somebody is waiting on, or has been given, cannot be deleted out
-- from under them. Settled requests do not block it; they go with the offer and
-- the audit log keeps the record.

create or replace function public.delete_offer(p_actor_id uuid, p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_offer public.offers%rowtype;
  v_brand public.brands%rowtype;
  v_open  integer;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_offer from public.offers where id = p_offer_id;
  if not found then
    raise exception 'no such offer' using errcode = 'P0002';
  end if;

  select count(*) into v_open
  from public.offer_applications a
  where a.offer_id = p_offer_id and a.status in ('pending', 'approved');

  if v_open > 0 then
    raise exception
      'creators are waiting on this offer, decide those % request(s) first', v_open
      using errcode = '23503';
  end if;

  select * into v_brand from public.brands where id = v_offer.brand_id;

  -- The audit row is written BEFORE the delete, in the same transaction, so
  -- the record of what was removed survives the removal.
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'offer.deleted', 'offer', v_offer.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_offer.brand_id,
      'title', v_offer.title,
      'video_count', v_offer.video_count,
      'reward_amount', v_offer.reward_amount,
      'currency', v_offer.currency
    ))
  );

  delete from public.offers where id = p_offer_id;

  return to_jsonb(v_offer);
end;
$$;

-- ----------------------------------------------------------------- locks ---

revoke all on function public.assert_active_creator(uuid)
  from public, anon, authenticated;
revoke all on function public.apply_for_offer(uuid, uuid, integer, numeric, text)
  from public, anon, authenticated;
revoke all on function public.withdraw_offer_application(uuid, uuid)
  from public, anon, authenticated;
revoke all on function
  public.review_offer_application(uuid, uuid, public.offer_application_status, text)
  from public, anon, authenticated;

grant execute on function public.apply_for_offer(uuid, uuid, integer, numeric, text)
  to service_role;
grant execute on function public.withdraw_offer_application(uuid, uuid) to service_role;
grant execute on function
  public.review_offer_application(uuid, uuid, public.offer_application_status, text)
  to service_role;
