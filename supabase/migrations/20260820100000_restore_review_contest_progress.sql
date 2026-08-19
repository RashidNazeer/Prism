-- ============================================================================
-- review_contest_progress, RESTORED, 2026-08-20
--
-- The migration before this one recreated this function by RETYPING it from
-- its own documentation instead of extracting the live body, and lost two
-- things in the process:
--
--   it wrote `message` where the column is `staff_message`, so every
--     confirmation failed with 42703 the moment an admin clicked Confirm;
--   it dropped the rule that a REJECTION must carry a sentence the creator can
--     read, which would have let staff refuse a claim in silence.
--
-- Caught by `pnpm verify:contests`, which clicks the real button on the real
-- screen: the claim never left the queue. That is exactly the class of bug the
-- suite exists for, and exactly the reason `review_content` in the offer
-- migration was patched from the extracted source rather than retyped.
--
-- This is the ORIGINAL body from 20260814120000, byte for byte, with one
-- change: `award_reached_terms` takes four arguments now, because it works the
-- approved video count out for itself.
-- ============================================================================

create or replace function public.review_contest_progress(
  p_actor_id uuid,
  p_update_id uuid,
  p_status public.contest_progress_status,
  -- THE CREATOR READS THIS. Message, not reason (D14).
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_row     public.contest_progress_updates%rowtype;
  v_entry   public.contest_entries%rowtype;
  v_contest public.contests%rowtype;
  v_brand   public.brands%rowtype;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_rewards jsonb := jsonb_build_object('awards', 0, 'amount', 0);
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if p_status not in ('confirmed', 'rejected') then
    raise exception 'a decision is confirmed or rejected' using errcode = '22023';
  end if;

  -- The lock comes first, before any test, and that is the whole double click
  -- and two admin guard.
  select * into v_row
  from public.contest_progress_updates
  where id = p_update_id
  for update;

  if not found then
    raise exception 'no such progress update' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'that update was already %', v_row.status using errcode = '55006';
  end if;

  -- A refusal with nothing said is a creator with nothing to act on, and this is
  -- the one screen where the sentence is the whole product.
  if p_status = 'rejected' and v_message is null then
    raise exception 'say what was wrong with these figures, the creator reads it'
      using errcode = '22023';
  end if;

  select * into v_entry from public.contest_entries where id = v_row.entry_id;
  select * into v_contest from public.contests where id = v_entry.contest_id;
  select * into v_brand from public.brands where id = v_entry.brand_id;

  /*
   * A confirmation on a dead contest would owe money on something we have
   * already declared finished. settle_contest refuses to close a contest with a
   * claim still pending precisely so this cannot be reached, and it is checked
   * here as well because the two have to agree from both directions or the
   * order somebody clicks in decides whether a creator gets paid.
   */
  if p_status = 'confirmed' and v_contest.settled_at is not null then
    raise exception 'that contest has been closed, so nothing more can be confirmed on it'
      using errcode = '22023';
  end if;
  if p_status = 'confirmed' and v_contest.cancelled_at is not null then
    raise exception 'that contest was cancelled, so nothing more can be confirmed on it'
      using errcode = '22023';
  end if;

  update public.contest_progress_updates
  set status        = p_status,
      staff_message = v_message,
      confirmed_by  = v_actor.id,
      confirmed_at  = now()
  where id = p_update_id
  returning * into v_row;

  -- The creator readable history row, carrying the message rather than pointing
  -- at it. contest_entry_events is what the entry's own timeline renders from.
  insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
  values (
    v_row.entry_id, v_row.creator_id,
    case when p_status = 'confirmed' then 'progress_confirmed' else 'progress_rejected' end,
    v_message, v_actor.id
  );

  /*
   * THE BILL. Rashid, 2026-08-14: a reward is owed the moment staff confirm the
   * figure that crosses its target. This is that moment, and it is the only
   * place in the product that can write a contest_awards row.
   */
  if p_status = 'confirmed' then
    /*
     * FOUR ARGUMENTS NOW, not five. `award_reached_terms` works the video
     * count out for itself from the APPROVED submissions, because since
     * 2026-08-20 that is what earns a video reward. The figure the creator
     * typed is still recorded on the claim and still audited below; it just
     * no longer buys anything.
     */
    v_rewards := private.award_reached_terms(
      v_row.entry_id, v_row.gmv, v_actor.id, null
    );
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest_progress.reviewed',
    'contest_progress', v_row.id, v_row.creator_id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_entry.brand_id,
      'contest', v_contest.name,
      'contest_id', v_contest.id,
      'entry_id', v_entry.id,
      'creator', v_entry.creator_handle,
      'status', p_status::text,
      'gmv', v_row.gmv,
      'video_count', v_row.video_count,
      'currency', v_entry.currency,
      'rewards_owed', nullif((v_rewards->>'awards')::int, 0),
      'rewards_amount', nullif((v_rewards->>'amount')::numeric, 0),
      'message', v_message
    ))
  );

  return to_jsonb(v_row) || jsonb_build_object('rewards', v_rewards);
end;
$$;

comment on function public.review_contest_progress(uuid, uuid, public.contest_progress_status, text) is
  'Staff confirm or refuse one claimed set of figures. Refuses a second decision on the same update, including from two admins at once, and refuses a rejection with nothing said. A confirmation writes the bill for any GMV target it crosses; video targets are earned by approving the videos, not by this click.';

revoke all on function public.review_contest_progress(
  uuid, uuid, public.contest_progress_status, text
) from public, anon, authenticated;
grant execute on function public.review_contest_progress(
  uuid, uuid, public.contest_progress_status, text
) to service_role;
