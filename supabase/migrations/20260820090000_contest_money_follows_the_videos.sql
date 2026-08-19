-- ============================================================================
-- CONTEST MONEY FOLLOWS THE VIDEOS, 2026-08-20
--
-- Rashid, asked which number decides a contest reward: "money is only owed when
-- all videos are up for both contest and offer it's like they will submit the
-- video when admin see one by one and all are approved only then money is
-- owed."
--
-- That is already true of offers as of 2026-08-19: a job reaches
-- `payment_pending` only when every video it committed is in AND approved. This
-- makes contests say the same sentence.
--
--
-- WHAT WAS TRUE UNTIL NOW. A creator typed "I have posted 10", staff clicked
-- Confirm, and `award_reached_terms` compared that typed 10 against the target.
-- The videos filed with the claim were evidence a human was expected to look at
-- BEFORE clicking, and nothing in the database compared the two afterwards. It
-- worked, but it put the whole control on one click.
--
-- Worse, the control on the other side did not exist at all:
-- `review_contest_content` has been finished, audited and granted since
-- 2026-08-13 and is called by NOTHING. No Edge Function action, no hook, no
-- screen. So `contest_submissions.status` could never leave its default
-- 'submitted', the admin queue read "With the team" on every contest video ever
-- filed, and the creator's own list carried fully styled "Counted" and "Sent
-- back" states that no code path could produce. This migration is half of
-- fixing that; the Edge Function action and the screen are the other half.
--
--
-- WHAT IS TRUE NOW.
--
--   video_count targets  earn when the number of APPROVED videos on the entry
--                        reaches the target. Not when the creator says so, and
--                        not when staff confirm a claim.
--   gmv targets          unchanged. There are no videos to approve behind a GMV
--                        figure, so the staff confirmation IS the control, and
--                        Rashid described that path separately and deliberately.
--
-- The pleasant consequence is that ORDER STOPS MATTERING. Whichever happens
-- last, the tenth approval or the confirmation of the claim, is what writes the
-- bill; both paths ask the same question of the same rows. There is no sequence
-- an admin can click that leaves money owed on work that was never approved.
--
--
-- AND TAKING AN APPROVAL BACK TAKES THE MONEY BACK, while it is still only
-- owed. Nine approved videos against a target of ten is not a reward, so the
-- row is withdrawn and the creator is told in their own timeline. It NEVER
-- touches an award that has been paid: at that point real money has left, and
-- the honest correction is a conversation, not a silent delete.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. How many videos on this entry a human has actually approved.
-- ----------------------------------------------------------------------------
/*
 * It counts the SUBMISSIONS, not the claims they arrived with. A video's own
 * decision is the video's own decision: if staff approved it, it counts, even
 * if the progress claim it came in on was later refused for some other reason.
 * The alternative, only counting videos on confirmed claims, would mean an
 * admin refusing a claim silently un-approved work they had already watched.
 */
create or replace function private.entry_approved_videos(p_entry_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.contest_submissions s
  where s.entry_id = p_entry_id
    and s.status = 'approved';
$$;

revoke all on function private.entry_approved_videos(uuid) from public, anon, authenticated;

comment on function private.entry_approved_videos(uuid) is
  'How many of this entry''s videos staff have approved. The number that decides video_count rewards since 2026-08-20, replacing the figure the creator typed.';


-- ----------------------------------------------------------------------------
-- 2. award_reached_terms loses p_video_count and works it out itself.
-- ----------------------------------------------------------------------------
/*
 * THE PARAMETER IS DROPPED RATHER THAN IGNORED. An argument that is still
 * accepted and no longer used is a trap: the next person passes the typed count
 * in good faith and cannot understand why it changes nothing. Two callers, both
 * in this migration.
 *
 * THE ASYMMETRY IS DELIBERATE AND IS THE WHOLE POINT. `p_gmv` is still passed
 * in, off the row the caller has already locked, exactly as the original note
 * on this function argued: the amount a creator is paid on should be the amount
 * a human just looked at and said yes to. That reasoning holds for GMV, where
 * the confirmation IS the check. It does NOT hold for videos any more, because
 * the check moved to the videos themselves, and re-reading them here is the
 * only way to ask the question this function now has to answer.
 */
drop function if exists private.award_reached_terms(uuid, numeric, integer, uuid, text);

create or replace function private.award_reached_terms(
  p_entry_id uuid,
  -- NULL means "do not consider GMV targets at this moment". The video review
  -- path passes null, because approving a video says nothing about GMV and a
  -- stale figure must not be able to buy a reward through the back door.
  p_gmv numeric,
  p_actor_id uuid,
  p_event_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.contest_entries%rowtype;
  v_term  public.contest_entry_terms%rowtype;
  v_award public.contest_awards%rowtype;
  v_total numeric := 0;
  v_count integer := 0;
  v_videos integer;
  v_reached numeric;
begin
  select * into v_entry from public.contest_entries where id = p_entry_id for update;

  if not found or v_entry.status <> 'approved' then
    return jsonb_build_object('awards', 0, 'amount', 0);
  end if;

  -- Once, inside the lock, so every term in the loop is judged against the same
  -- number and two terms cannot disagree about how much work exists.
  v_videos := private.entry_approved_videos(p_entry_id);

  for v_term in
    select t.*
    from public.contest_entry_terms t
    where t.entry_id = p_entry_id
      and t.reward_amount > 0
      and case t.type
            when 'gmv'         then coalesce(p_gmv, 0) >= t.target_value
            when 'video_count' then v_videos >= t.target_value
            else false
          end
      and not exists (
        select 1 from public.contest_awards w
        where w.entry_id = p_entry_id and w.term_id = t.id
      )
    order by t.target_value, t.id
  loop
    v_award := null;

    v_reached := case v_term.type
                   when 'gmv' then coalesce(p_gmv, 0)
                   else v_videos::numeric
                 end;

    insert into public.contest_awards (
      contest_id, entry_id, creator_id, term_id,
      awarded_amount, awarded_currency, reached_value, awarded_by
    )
    values (
      v_entry.contest_id, v_entry.id, v_entry.creator_id, v_term.id,
      v_term.reward_amount, v_term.currency, v_reached, p_actor_id
    )
    on conflict on constraint contest_awards_one_per_term do nothing
    returning * into v_award;

    if v_award.id is null then
      continue;
    end if;

    insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
    values (
      v_entry.id, v_entry.creator_id, 'reward_owed',
      coalesce(
        p_event_note,
        format('%s. %s %s is now owed to you.',
               v_term.title, v_term.currency, trim(to_char(v_term.reward_amount, 'FM999999990.00')))
      ),
      p_actor_id
    );

    v_total := v_total + v_term.reward_amount;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('awards', v_count, 'amount', v_total, 'currency', v_entry.currency);
end;
$$;

revoke all on function private.award_reached_terms(uuid, numeric, uuid, text)
  from public, anon, authenticated;

comment on function private.award_reached_terms(uuid, numeric, uuid, text) is
  'Writes a contest_awards row for every reward this entry has just earned and has not been awarded yet. Video targets are judged on the APPROVED submissions, read here; GMV targets on the figure the caller passes off a row it has already locked. In `private` so PostgREST cannot expose a money writer as an RPC.';


-- ----------------------------------------------------------------------------
-- 3. And the other direction: a reward that is no longer earned.
-- ----------------------------------------------------------------------------
/*
 * WHY THIS IS A DELETE AND NOT A REVERSAL ROW.
 *
 * `docs/PARKED.md` argues, correctly, that UNPAYING should write a reversal
 * rather than clear `paid_at`, so the history stays true. That is about money
 * that has already left. This is not: an owed award is a statement of intent
 * that turned out to be wrong, no payment happened, and `contest_awards_money_idx`
 * is unique per (contest, entry, term), so a negative row could not be written
 * beside it without dismantling the guard that stops a double award.
 *
 * The history is kept where it belongs instead: a `reward_withdrawn` row in the
 * creator's own timeline, which they can read, and an audit row naming the
 * member of staff whose decision caused it, which they cannot.
 *
 * PAID AWARDS ARE NEVER TOUCHED. Not skipped quietly either: the caller gets
 * the count back so a screen can say "that video is sent back, but the reward
 * was already paid" rather than implying money moved.
 */
create or replace function private.withdraw_unearned_awards(
  p_entry_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry   public.contest_entries%rowtype;
  v_award   public.contest_awards%rowtype;
  v_term    public.contest_entry_terms%rowtype;
  v_videos  integer;
  v_total   numeric := 0;
  v_count   integer := 0;
  v_locked  integer := 0;
begin
  select * into v_entry from public.contest_entries where id = p_entry_id for update;
  if not found then
    return jsonb_build_object('withdrawn', 0, 'amount', 0, 'already_paid', 0);
  end if;

  v_videos := private.entry_approved_videos(p_entry_id);

  for v_award in
    select w.*
    from public.contest_awards w
    join public.contest_entry_terms t on t.id = w.term_id
    where w.entry_id = p_entry_id
      -- Video targets only. A GMV award is not ours to unpick from here:
      -- approving or refusing a video says nothing about a GMV figure.
      and t.type = 'video_count'
      and v_videos < t.target_value
    for update
  loop
    select * into v_term from public.contest_entry_terms where id = v_award.term_id;

    if v_award.paid_at is not null then
      v_locked := v_locked + 1;
      continue;
    end if;

    delete from public.contest_awards where id = v_award.id;

    insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
    values (
      v_entry.id, v_entry.creator_id, 'reward_withdrawn',
      format(
        '%s. A video was sent back, so you are at %s of %s approved and this reward is on hold until it is replaced.',
        v_term.title, v_videos, v_term.target_value
      ),
      p_actor_id
    );

    v_total := v_total + v_award.awarded_amount;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'withdrawn', v_count,
    'amount', v_total,
    'already_paid', v_locked,
    'currency', v_entry.currency
  );
end;
$$;

revoke all on function private.withdraw_unearned_awards(uuid, uuid)
  from public, anon, authenticated;

comment on function private.withdraw_unearned_awards(uuid, uuid) is
  'Removes contest_awards rows for video targets this entry no longer reaches, writing the creator a reward_withdrawn event for each. Never touches a paid award; reports how many it left alone so a screen can say so.';


-- ----------------------------------------------------------------------------
-- 4. review_contest_content decides the video AND the money it moves.
-- ----------------------------------------------------------------------------
/*
 * Everything that made the original correct is carried through unchanged: staff
 * only, a decision may not be 'submitted', the row is taken FOR UPDATE before
 * its status is read, a decision is still allowed on a settled contest so a
 * submission left over cannot strand somebody, and the audit row records what
 * the status WAS as well as where it landed.
 *
 * What is new is the last block, and it is the whole point of the migration: a
 * video decision now moves money, in the same transaction, in both directions.
 * `p_gmv => null` on the award call, because approving a video is not evidence
 * about GMV and must not be able to buy a GMV reward.
 */
create or replace function public.review_contest_content(
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
  v_row      public.contest_submissions%rowtype;
  v_contest  public.contests%rowtype;
  v_brand    public.brands%rowtype;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_was      public.content_status;
  v_rewards  jsonb := jsonb_build_object('awards', 0, 'amount', 0);
  v_pulled   jsonb := jsonb_build_object('withdrawn', 0, 'amount', 0, 'already_paid', 0);
  v_approved integer;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if p_status = 'submitted' then
    raise exception 'a review has to be a decision' using errcode = '22023';
  end if;

  select * into v_row from public.contest_submissions
  where id = p_content_id for update;
  if not found then
    raise exception 'no such submission' using errcode = 'P0002';
  end if;

  v_was := v_row.status;

  update public.contest_submissions
  set status = p_status,
      decision_note = v_note,
      decided_by = v_actor.id,
      decided_at = now()
  where id = p_content_id
  returning * into v_row;

  /*
   * THE MONEY, and only when the decision actually changed something. Clicking
   * Approve twice must not write a second event, and re-sending back something
   * already sent back must not either.
   */
  if v_row.entry_id is not null and v_was is distinct from p_status then
    if p_status = 'approved' then
      v_rewards := private.award_reached_terms(v_row.entry_id, null, v_actor.id, null);
    elsif v_was = 'approved' then
      v_pulled := private.withdraw_unearned_awards(v_row.entry_id, v_actor.id);
    end if;
  end if;

  v_approved := case
                  when v_row.entry_id is null then 0
                  else private.entry_approved_videos(v_row.entry_id)
                end;

  select * into v_contest from public.contests where id = v_row.contest_id;
  select * into v_brand from public.brands where id = v_row.brand_id;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest_content.reviewed',
    'contest_submission', v_row.id, v_row.creator_id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'contest', v_contest.name,
      'contest_id', v_contest.id,
      'creator', v_row.creator_handle,
      'status', p_status::text,
      'was', v_was::text,
      'ad_code', v_row.ad_code,
      'approved_now', v_approved,
      'rewards_owed', nullif((v_rewards->>'awards')::int, 0),
      'rewards_amount', nullif((v_rewards->>'amount')::numeric, 0),
      'rewards_withdrawn', nullif((v_pulled->>'withdrawn')::int, 0),
      'rewards_withdrawn_amount', nullif((v_pulled->>'amount')::numeric, 0),
      'note', v_note
    ))
  );

  return jsonb_build_object(
    'submission', to_jsonb(v_row),
    'approved_videos', v_approved,
    'rewards', v_rewards,
    'withdrawn', v_pulled
  );
end;
$$;

comment on function public.review_contest_content(uuid, uuid, public.content_status, text) is
  'Staff approve one contest video or send it back. Since 2026-08-20 this is also where video reward money is decided: the last approval that reaches a video target owes the reward, and taking an approval back withdraws it again unless it has already been paid.';

revoke all on function public.review_contest_content(
  uuid, uuid, public.content_status, text
) from public, anon, authenticated;
grant execute on function public.review_contest_content(
  uuid, uuid, public.content_status, text
) to service_role;


-- ----------------------------------------------------------------------------
-- 5. review_contest_progress, for the one line that has to change.
-- ----------------------------------------------------------------------------
/*
 * Recreated only because `award_reached_terms` lost a parameter. Everything
 * else is identical to 20260814120000. The behaviour that changes is entirely
 * inside the function it calls: confirming a claim still writes the bill for
 * GMV targets, and now only reaches a video target if the videos behind it have
 * actually been approved.
 *
 * That is what makes the order of clicks stop mattering. An admin who approves
 * ten videos and then confirms the claim, and an admin who confirms first and
 * approves after, both end with the same money owed, because both paths ask the
 * same question of the same rows.
 */
create or replace function public.review_contest_progress(
  p_actor_id uuid,
  p_update_id uuid,
  p_status public.contest_progress_status,
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

  if p_status = 'pending' then
    raise exception 'a review has to be a decision' using errcode = '22023';
  end if;

  select * into v_row from public.contest_progress_updates
  where id = p_update_id for update;
  if not found then
    raise exception 'no such progress update' using errcode = 'P0002';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'this claim has already been %', v_row.status
      using errcode = '55006';
  end if;

  update public.contest_progress_updates
  set status = p_status,
      message = v_message,
      reviewed_by = v_actor.id,
      reviewed_at = now()
  where id = p_update_id
  returning * into v_row;

  select * into v_entry from public.contest_entries where id = v_row.entry_id;
  select * into v_contest from public.contests where id = v_entry.contest_id;
  select * into v_brand from public.brands where id = v_entry.brand_id;

  insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
  values (
    v_row.entry_id, v_row.creator_id,
    case when p_status = 'confirmed' then 'progress_confirmed' else 'progress_rejected' end,
    v_message, v_actor.id
  );

  if p_status = 'confirmed' then
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
  'Staff confirm or refuse one claimed set of figures. Refuses a second decision on the same update, including from two admins at once. A confirmation writes the bill for any GMV target it crosses; video targets are earned by approving the videos, not by this click.';
