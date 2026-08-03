-- ============================================================================
-- What a brand's budget has actually been committed to.
-- ============================================================================
-- Approving a creator for an offer is the moment money stops being a plan and
-- becomes a promise. From now on that promise is counted against the brand's
-- allocated budget, per brand, because each brand's budget is its own.
--
-- Rashid's example: Bentgo is allocated $1,000. Two creators are approved, one
-- on a $100 offer and one on a $200 offer. Bentgo has used $300 and has $700
-- left. Nothing about any other brand moves.
--
-- Three pieces:
--
-- 1. `offer_applications.committed_amount` snapshots what the offer paid AT THE
--    MOMENT it was approved. Not read live from the offer, because an admin
--    re-pricing an offer next month must not silently rewrite what a creator
--    was already promised, nor quietly change a budget that has already been
--    reported on.
--
-- 2. `brand_commercials.budget_used` is the running total, kept by the same
--    transaction that does the approving, so the row and the total can never
--    disagree.
--
-- 3. `budget_used_percent` is generated from the two, so the admin brand list
--    can filter on "more than 80% used" in the database instead of fetching
--    every brand and working it out in a browser.
--
-- All three live on the STAFF-ONLY side of the split. `budget_used` sits in
-- `brand_commercials` next to `budget_allocated` for exactly the same reason:
-- a creator must never be able to read what a brand is spending.
-- ============================================================================

alter table public.offer_applications
  add column committed_amount numeric(12, 2)
    check (committed_amount is null or committed_amount >= 0);

comment on column public.offer_applications.committed_amount is
  'What the offer paid when this request was approved. A snapshot: re-pricing the offer later must not rewrite a promise already made. Null until approved, and null on an approved request against an offer with no fixed fee.';

alter table public.brand_commercials
  add column budget_used numeric(14, 2) not null default 0
    check (budget_used >= 0);

comment on column public.brand_commercials.budget_used is
  'Sum of committed_amount across this brand''s approved offer requests. Maintained by review_offer_application in the same transaction as the approval.';

/*
 * Generated, and stored, so it can be indexed and filtered on.
 *
 * Null when there is no budget to measure against: "0% of nothing" is not a
 * fact, and a brand with no allocation should not appear in a search for
 * brands under 50% used.
 */
alter table public.brand_commercials
  add column budget_used_percent numeric(7, 2)
    generated always as (
      case
        when budget_allocated is null or budget_allocated <= 0 then null
        else round(100 * budget_used / budget_allocated, 2)
      end
    ) stored;

create index brand_commercials_used_percent_idx
  on public.brand_commercials (budget_used_percent);

-- ------------------------------------------------------------- backfill ---
-- Anything already approved was a commitment too, whatever it predates.

update public.offer_applications a
set committed_amount = o.reward_amount
from public.offers o
where a.offer_id = o.id
  and a.status = 'approved'
  and a.committed_amount is null;

update public.brand_commercials c
set budget_used = coalesce(
  (
    select sum(a.committed_amount)
    from public.offer_applications a
    where a.brand_id = c.brand_id and a.status = 'approved'
  ),
  0
);

-- ============================================================================
-- Approving now moves the budget, in the same transaction.
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
  v_actor     public.profiles%rowtype;
  v_row       public.offer_applications%rowtype;
  v_offer     public.offers%rowtype;
  v_brand     public.brands%rowtype;
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_committed numeric := null;
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
  end if;

  update public.offer_applications
  set status           = p_decision,
      decided_by       = v_actor.id,
      decided_at       = now(),
      decision_note    = v_note,
      committed_amount = v_committed
  where id = p_application_id
  returning * into v_row;

  /*
   * Charge the brand. Only ever this brand: the request carries its own
   * brand_id, taken from the offer when it was made, so there is no way for an
   * approval to touch anybody else's money.
   *
   * An offer with no fixed fee commits nothing measurable, so it adds nothing
   * rather than adding a guessed number. It still shows as a creator on the
   * offer; it just cannot be counted in pounds.
   */
  if p_decision = 'approved' and coalesce(v_committed, 0) > 0 then
    update public.brand_commercials
    set budget_used = budget_used + v_committed
    where brand_id = v_row.brand_id;
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
      'currency', v_row.currency,
      'note', v_note
    ))
  );

  return to_jsonb(v_row);
end;
$$;
