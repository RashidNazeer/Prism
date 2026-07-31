-- ============================================================================
-- Creators take an offer as it is written. They do not name their own price.
-- ============================================================================
-- Rashid's call, 2026-07-31, reversing the counter offer shipped this morning.
-- A creator asks for the deal on the table, and that is the whole of it.
--
-- The two proposal columns are KEPT rather than dropped. Requests made while
-- countering was allowed still carry real numbers, and an admin reading the
-- queue next month should see what was actually agreed rather than a row that
-- now claims it was taken as written. Nothing can write them again: the only
-- function that ever could no longer takes them.
--
-- If countering comes back, it comes back as parameters on this function and a
-- field in the dialog. The columns and the admin rendering are already there.
-- ============================================================================

comment on column public.offer_applications.proposed_video_count is
  'Historical. Set only by requests made while creators could counter an offer (2026-07-31). Null on everything since: an offer is taken as written.';
comment on column public.offer_applications.proposed_amount is
  'Historical. See proposed_video_count.';

-- The old signature has to go rather than be replaced: leaving it in place
-- would leave a second, looser way in, which is exactly what this change is
-- removing.
drop function if exists public.apply_for_offer(uuid, uuid, integer, numeric, text);

create or replace function public.apply_for_offer(
  p_actor_id uuid,
  p_offer_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  public.profiles%rowtype;
  v_offer  public.offers%rowtype;
  v_brand  public.brands%rowtype;
  v_row    public.offer_applications%rowtype;
  v_handle text;
  v_note   text := nullif(trim(coalesce(p_note, '')), '');
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

  -- An offer with no stated terms is still applyable. The rule that an offer
  -- needing an application must carry terms is enforced where it belongs, on
  -- the admin's side of the product, and refusing a creator here because an
  -- admin left a field empty would punish the wrong person.

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
    currency, note
  )
  values (
    p_offer_id, v_offer.brand_id, v_actor.id, v_handle, v_actor.display_name,
    v_actor.email, v_offer.currency, v_note
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
      'video_count', v_offer.video_count,
      'reward_amount', v_offer.reward_amount,
      'currency', v_offer.currency
    ))
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.apply_for_offer(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_for_offer(uuid, uuid, text) to service_role;
