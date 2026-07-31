-- ============================================================================
-- Fix: `review_offer_application` still referenced the dropped columns.
-- ============================================================================
-- Dropping `proposed_video_count` and `proposed_amount` did not fail, and
-- nothing complained, because plpgsql resolves field names when the function
-- RUNS rather than when it is created. So `v_row.proposed_amount` inside the
-- audit row stayed valid-looking SQL right up until an admin clicked Approve,
-- and then returned a 500.
--
-- Caught by `check-offer-requests.mjs`, which approves a real request through
-- the real screen. A migration that "applied cleanly" is not the same as a
-- migration that works.
--
-- Lesson for the next column drop: grep the function bodies too. The database
-- will not do it for you.
-- ============================================================================

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
    -- The offer's own terms, because those are what was agreed to. A creator
    -- takes an offer as it is written.
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'offer', v_offer.title,
      'creator', v_row.creator_handle,
      'video_count', v_offer.video_count,
      'reward_amount', v_offer.reward_amount,
      'currency', v_row.currency,
      'note', v_note
    ))
  );

  return to_jsonb(v_row);
end;
$$;
