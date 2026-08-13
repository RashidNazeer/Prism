-- ============================================================================
-- Contest rewards: owed the moment staff confirm, then paid
-- ============================================================================
/*
 * WHAT RASHID DECIDED, 2026-08-14, and it is the whole shape of this file.
 *
 *   1. A reward becomes money owed THE MOMENT STAFF CONFIRM the figure that
 *      crosses its target. Not at the end of the contest.
 *   2. The product tracks two states, OWED then PAID. Staff mark a reward paid
 *      and the creator watches it change.
 *
 * WHY THAT IS A REWRITE RATHER THAN A SCREEN. `settle_contest` was written for
 * a model where nobody could know who had won until the contest ended, because
 * rewards were placings. Placings were dropped on 2026-08-13
 * (20260814010000_contest_deliverables_and_progress.sql:1351-1382), which left
 * settlement holding money it no longer had any reason to hold: the instant a
 * member of staff confirms 640 against a 500 target, that $200 is earned, and
 * there is nothing left to discover by waiting eleven weeks for the contest to
 * close. So the money event MOVES to the confirmation, and closing a contest
 * stops being a money event at all.
 *
 * THE MOMENT OF TRUTH DOES NOT MOVE, WHICH IS THE POINT. Nothing here lets a
 * creator's own typing owe them a penny. `review_contest_progress` is still the
 * only door, it is still staff only, it still refuses a second decision on the
 * same claim, and it still takes the row FOR UPDATE before it reads it. All
 * that changes is that a decision somebody was already making by hand now also
 * writes down what it obliges us to pay, instead of leaving that to be worked
 * out later from a screen that did not exist.
 *
 * SO `contest_awards` STOPS BEING A SETTLEMENT TABLE AND BECOMES A BILL.
 * Every row is money owed against one frozen promise, and it carries the state
 * of that money. The outcome row, the placement column and the whole idea of
 * one big terminal payout go with the model that needed them.
 *
 * WHAT IS SAFE TO DO HERE, AND WHY. `contest_awards` HAS NO ROWS. Settlement
 * was never wired to a screen, so nothing was ever written through it, and the
 * reshape below costs nobody a record. Checked on dev before this was written;
 * prod has never seen a contest at all. If that is ever untrue on another
 * database the not-null on term_id is the line that will refuse, loudly, which
 * is the correct outcome.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO:
 *   - It does not let anything be UNPAID again. Money marked paid is a fact
 *     somebody asserted; the guard against a mis-click is a confirmation step
 *     on the screen, the same as every other decision in the product.
 *   - It does not refuse to award over budget. Going over budget is allowed and
 *     shown, never blocked, which is the rule the brand budget bar has followed
 *     since 20260801093000_brand_budget_used.sql. A confirmation is a statement
 *     about what a creator actually did, and a budget must never make us
 *     pretend they did less. The overage is surfaced on the admin screen.
 *   - It does not touch what a creator can read. `contest_awards_select_own`
 *     already says creator_id = auth.uid() and is not widened by one byte.
 */

-- ============================================================================
-- 1. contest_awards, reshaped into a bill
-- ============================================================================

/*
 * `note` becomes `message`, and this is the same trap as `cancel_reason`, which
 * became `cancel_message` on 2026-08-13 (decision D14). THE CREATOR READS THIS
 * COLUMN. `contest_awards_select_own` has always let them, and a column called
 * "note" on a money table reads to whoever writes the next admin screen like a
 * private one, so somebody eventually types the reason we are only paying half
 * into a box the person being half paid can see.
 *
 * Renamed while the table is empty, which is the only free moment it will ever
 * have.
 */
alter table public.contest_awards rename column note to message;

/*
 * The two table level checks both mention term_id and both encode the outcome
 * row, which is being removed. Dropped by what they say rather than by a
 * generated name, because `contest_awards_check` and `contest_awards_check1`
 * are assigned in creation order and guessing which is which is how a migration
 * drops the wrong one and passes.
 */
do $$
declare
  v_name text;
begin
  for v_name in
    select conname
    from pg_constraint
    where conrelid = 'public.contest_awards'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%term_id%'
  loop
    execute format('alter table public.contest_awards drop constraint %I', v_name);
  end loop;
end $$;

/*
 * The placement column goes, and the migration that dropped placings said this
 * one would: "contest_awards.placement and contest_awards_placement_idx
 * survive, and with placings dropped nothing should be writing a placement. The
 * column is still reachable through p_outcomes, so the screen must not offer it
 * and the next migration on this feature should drop it."
 * (20260814010000_contest_deliverables_and_progress.sql:1371-1376.)
 *
 * This is that migration. Its index goes with it automatically.
 */
alter table public.contest_awards drop column if exists placement;

/*
 * EVERY ROW IS MONEY AGAINST A PROMISE. There is no other kind of row any more,
 * so the shape says so rather than a comment saying so.
 *
 * The outcome row existed to carry a placing for entrants who won nothing, so
 * that a fifth place finisher had something to read. There are no placings and
 * nothing to read, and a row worth zero pointing at no promise is a row that
 * turns up in a sum of money owed and contributes an entrant to the count.
 */
alter table public.contest_awards
  drop constraint if exists contest_awards_awarded_amount_check;

alter table public.contest_awards
  alter column term_id set not null,
  add constraint contest_awards_amount_positive check (awarded_amount > 0);

/*
 * CASCADE, not SET NULL, now that term_id cannot be null. A term dies only when
 * its entry dies, and the award cascades from the same entry, so in practice
 * neither ever fires. SET NULL would have been a not-null violation raised from
 * inside a cascade, which is a genuinely baffling error to meet at eleven at
 * night.
 */
alter table public.contest_awards
  drop constraint contest_awards_term_id_fkey,
  add constraint contest_awards_term_id_fkey
    foreign key (term_id) references public.contest_entry_terms (id) on delete cascade;

/*
 * ONE AWARD PER PROMISE, and it is now a plain constraint rather than the old
 * partial unique index, because the predicate it was partial on (term_id is not
 * null) is now true of every row.
 *
 * THIS IS THE DOUBLE PAYMENT GUARD, and it matters more than it did. Awarding
 * used to happen once, behind one button. It now happens on every confirmation,
 * so a creator who reports 640 in week one and 900 in week two crosses the same
 * 500 target twice and this is the line that means they are paid for it once.
 * `on conflict` in the writer leans on it by name.
 */
drop index if exists public.contest_awards_money_idx;
drop index if exists public.contest_awards_outcome_idx;

alter table public.contest_awards
  add constraint contest_awards_one_per_term unique (contest_id, entry_id, term_id);

/*
 * THE TWO STATES. Owed is paid_at is null; paid is not. There is no enum,
 * because there are exactly two states and the second one needs a time and an
 * actor anyway, which is the same shape `settled_at` / `settled_by` and
 * `decided_at` / `decided_by` already use everywhere else in this product.
 */
alter table public.contest_awards
  add column paid_at timestamptz,
  add column paid_by uuid references public.profiles (id) on delete set null,
  add constraint contest_awards_paid_pair check ((paid_at is null) = (paid_by is null));

/*
 * The figure that actually crossed the target, frozen at the moment it did.
 * The term carries what was asked for; without this the award cannot say what
 * was delivered, and confirmed totals move afterwards, so a receipt written six
 * weeks later would quote a different number than the one we paid on.
 */
alter table public.contest_awards
  add column reached_value numeric(14, 2) check (reached_value is null or reached_value >= 0);

-- The rewards queue: what we owe, oldest first, across every contest. Partial,
-- because a paid award leaves it rather than accumulating in it forever.
create index contest_awards_owed_idx
  on public.contest_awards (created_at)
  where paid_at is null;

comment on table public.contest_awards is
  'The bill. One row per reward a creator has earned, written the moment staff confirm the figure that crossed its target, and never written by anything else. Every row is money against one frozen promise in contest_entry_terms. Two states: owed while paid_at is null, paid after. The creator reads their own rows, including message, so nothing private goes in it.';

comment on column public.contest_awards.message is
  'THE CREATOR READS THIS. Optional, written when staff mark the reward paid. Named message rather than note for the same reason cancel_reason became cancel_message: a note is somewhere people put things they would not say to the person.';

comment on column public.contest_awards.reached_value is
  'The confirmed figure that crossed this reward''s target, frozen at the moment it did. The target itself lives on the term. Nullable only because rows backfilled from progress confirmed before rewards existed carry the total at backfill time.';

-- Money landing is the single most felt moment in the product, and a creator
-- watching their contest screen should see Owed appear without reloading. The
-- select policy is unchanged, so realtime delivers a row only to the person it
-- belongs to and to staff.
alter publication supabase_realtime add table public.contest_awards;

-- ============================================================================
-- 2. private.award_reached_terms, the one writer
-- ============================================================================
/*
 * IN `private`, NOT `public`, AND THAT IS A SECURITY DECISION. PostgREST exposes
 * every executable function in an exposed schema as an RPC endpoint. This one
 * writes money rows and takes an entry id and a figure as arguments, so in
 * `public` it would be a "pay me anything" endpoint one bad grant away from
 * working. `private` is not exposed at all, which is why
 * `contest_excludes_caller` was moved there on 2026-08-13.
 *
 * It is called from exactly one place, review_contest_progress, and it inherits
 * that function's staff check rather than repeating it. It does no permission
 * checking of its own ON PURPOSE: a helper that half checks is worse than one
 * that plainly cannot be reached, because the half check reads like the whole
 * one to the next person.
 *
 * IT NEVER RE-READS THE FIGURES. The caller passes the numbers off the row it
 * has already locked, so the amount a creator is paid on is exactly the amount
 * a human just looked at and said yes to. Re-reading a view here would let a
 * concurrent write change what was agreed to between the decision and the bill.
 */
create or replace function private.award_reached_terms(
  p_entry_id uuid,
  p_gmv numeric,
  p_video_count integer,
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
  v_reached numeric;
begin
  -- The lock that makes two confirmations on one entry serial. In practice
  -- there is only ever one pending claim per entry so they cannot collide, but
  -- the constraint below is a 23505 in the creator's face and this is a wait.
  select * into v_entry from public.contest_entries where id = p_entry_id for update;

  if not found or v_entry.status <> 'approved' then
    return jsonb_build_object('awards', 0, 'amount', 0);
  end if;

  for v_term in
    select t.*
    from public.contest_entry_terms t
    where t.entry_id = p_entry_id
      and t.reward_amount > 0
      and case t.type
            when 'gmv'         then coalesce(p_gmv, 0) >= t.target_value
            when 'video_count' then coalesce(p_video_count, 0) >= t.target_value
            else false
          end
      and not exists (
        select 1 from public.contest_awards w
        where w.entry_id = p_entry_id and w.term_id = t.id
      )
    -- Smallest target first, so a creator who crosses two at once reads their
    -- own timeline in the order they earned them rather than at random.
    order by t.target_value, t.id
  loop
    v_award := null;

    v_reached := case v_term.type
                   when 'gmv' then coalesce(p_gmv, 0)
                   else coalesce(p_video_count, 0)::numeric
                 end;

    insert into public.contest_awards (
      contest_id, entry_id, creator_id, term_id,
      awarded_amount, awarded_currency, reached_value, awarded_by
    )
    values (
      v_entry.contest_id, v_entry.id, v_entry.creator_id, v_term.id,
      v_term.reward_amount, v_term.currency, v_reached, p_actor_id
    )
    -- Belt and braces with the not exists above. The constraint is the one that
    -- would survive a concurrent writer; the not exists is what keeps this loop
    -- from raising on the ordinary path.
    on conflict on constraint contest_awards_one_per_term do nothing
    returning * into v_award;

    if v_award.id is null then
      continue;
    end if;

    -- The creator's own timeline. They should learn they are owed money from
    -- the product rather than from noticing a figure changed.
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

revoke all on function private.award_reached_terms(uuid, numeric, integer, uuid, text)
  from public, anon, authenticated;

comment on function private.award_reached_terms(uuid, numeric, integer, uuid, text) is
  'Writes a contest_awards row for every reward this entry has just earned and has not been awarded yet, at the figures it is given. In `private` because PostgREST would otherwise expose a money writer as an RPC. Called only by review_contest_progress, whose staff check it inherits and does not repeat.';

-- ============================================================================
-- 3. review_contest_progress, which now also writes the bill
-- ============================================================================
/*
 * REPLACED FOR ONE BLOCK, and everything that made this function the moment of
 * truth is copied through unchanged rather than reworded: staff only, one
 * decision per update even against two admins in the same second, the row taken
 * FOR UPDATE before its status is read, a refusal must say why, and it does not
 * touch the videos.
 *
 * The block that is new is at the end, and it is four lines: if this was a
 * confirmation, write down what it obliges us to pay.
 *
 * IT AWARDS ON THE FIGURES OFF THE LOCKED ROW, not on contest_entry_confirmed_
 * totals. Those two agree, because the figures are cumulative and this update is
 * by construction the newest confirmed one (a creator may hold only one pending
 * claim at a time). Reading the view anyway would make the amount we pay depend
 * on a view definition rather than on the number the admin just approved, and
 * those are the same thing right up until the day somebody edits the view.
 *
 * THE RETURN VALUE GREW A `rewards` KEY so the admin screen can say "confirmed,
 * and $850 is now owed to Tom" in the same breath as the decision. The database
 * has always returned more than the screen used; this is the one figure a human
 * genuinely needs to see at the moment they click.
 */
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
    v_rewards := private.award_reached_terms(
      v_row.entry_id, v_row.gmv, v_row.video_count, v_actor.id, null
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
  'Staff confirm or refuse one claimed set of figures. Refuses a second decision on the same update, including from two admins at once, because the row is locked before its status is read. A confirmation ALSO writes the bill: every reward whose target these figures cross becomes money owed, once, through private.award_reached_terms. Does not touch the videos: those are reviewed one by one through review_contest_content.';

revoke all on function public.review_contest_progress(
  uuid, uuid, public.contest_progress_status, text
) from public, anon, authenticated;
grant execute on function public.review_contest_progress(
  uuid, uuid, public.contest_progress_status, text
) to service_role;

-- ============================================================================
-- 4. pay_contest_awards, the second state
-- ============================================================================
/*
 * TAKES A LIST, because the screen this serves is a queue of everything we owe
 * across every contest, and paying a run of creators in one sitting is the
 * actual job. One id is a list of one, so there is one code path rather than
 * two that can disagree.
 *
 * EVERYTHING HAPPENS IN ONE TRANSACTION. If the eleventh row refuses, the first
 * ten roll back too. That is the right way round for money: a partial success
 * with no way to see which half landed is worse than a refusal with a reason.
 *
 * RULE S8 MOVES HERE, AND THIS IS WHERE IT ALWAYS BELONGED. settle_contest
 * refused to award a suspended entrant without p_allow_suspended, because
 * awarding was the moment money moved. Money moves here now. A suspended
 * creator keeps everything they earned, and paying them is a decision somebody
 * makes on purpose rather than a row that slips through with the rest.
 *
 * THERE IS NO WAY BACK. Nothing unpays an award. The guard against a mis-click
 * is a confirmation step on the screen, which is what every other decision in
 * this product uses, and an audit row naming who clicked.
 */
create or replace function public.pay_contest_awards(
  p_actor_id uuid,
  p_award_ids uuid[],
  -- THE CREATOR READS THIS, on every award in the list.
  p_message text default null,
  p_allow_suspended boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_award   public.contest_awards%rowtype;
  v_term    public.contest_entry_terms%rowtype;
  v_contest public.contests%rowtype;
  v_brand   public.brands%rowtype;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_id      uuid;
  v_count   integer := 0;
  v_total   numeric := 0;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if p_award_ids is null or cardinality(p_award_ids) = 0 then
    raise exception 'pick at least one reward to mark paid' using errcode = '22023';
  end if;
  -- The same cap bulk application review uses. A number this size is a person
  -- working; anything larger is a script, and a script should say so.
  if cardinality(p_award_ids) > 100 then
    raise exception 'that is more than 100 rewards at once' using errcode = '22023';
  end if;

  foreach v_id in array p_award_ids loop
    select * into v_award from public.contest_awards where id = v_id for update;

    if not found then
      raise exception 'no such reward' using errcode = 'P0002';
    end if;
    if v_award.paid_at is not null then
      raise exception 'one of those was already marked paid' using errcode = '55006';
    end if;

    if not coalesce(p_allow_suspended, false) and not exists (
      select 1 from public.profiles p where p.id = v_award.creator_id and p.is_active
    ) then
      raise exception 'that creator''s account is suspended, so paying them has to be done on purpose'
        using errcode = '42501';
    end if;

    select * into v_term    from public.contest_entry_terms where id = v_award.term_id;
    select * into v_contest from public.contests           where id = v_award.contest_id;
    select * into v_brand   from public.brands             where id = v_contest.brand_id;

    update public.contest_awards
    set paid_at = now(),
        paid_by = v_actor.id,
        message = coalesce(v_message, message)
    where id = v_id
    returning * into v_award;

    insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
    values (
      v_award.entry_id, v_award.creator_id, 'reward_paid',
      coalesce(
        v_message,
        format('%s. %s %s has been paid.',
               coalesce(v_term.title, 'Contest reward'),
               v_award.awarded_currency,
               trim(to_char(v_award.awarded_amount, 'FM999999990.00')))
      ),
      v_actor.id
    );

    insert into public.audit_log (
      actor_id, actor_email, actor_role, action, subject_type, subject_id,
      target_user_id, detail
    )
    values (
      v_actor.id, v_actor.email, v_actor.role, 'contest_award.paid',
      'contest_award', v_award.id, v_award.creator_id,
      jsonb_strip_nulls(jsonb_build_object(
        'brand', v_brand.name,
        'brand_id', v_contest.brand_id,
        'contest', v_contest.name,
        'contest_id', v_contest.id,
        'entry_id', v_award.entry_id,
        'reward', v_term.title,
        'amount', v_award.awarded_amount,
        'currency', v_award.awarded_currency,
        'allowed_suspended', coalesce(p_allow_suspended, false),
        'message', v_message
      ))
    );

    v_count := v_count + 1;
    v_total := v_total + v_award.awarded_amount;
  end loop;

  return jsonb_build_object('paid', v_count, 'amount', v_total);
end;
$$;

comment on function public.pay_contest_awards(uuid, uuid[], text, boolean) is
  'Marks one or more earned contest rewards paid, in a single transaction, staff only. Refuses a second payment on the same reward, and refuses a suspended creator unless somebody says so out loud (rule S8, moved here from settle_contest because this is where money now moves). There is no way to unpay: the guard is a confirmation step on the screen.';

revoke all on function public.pay_contest_awards(uuid, uuid[], text, boolean)
  from public, anon, authenticated;
grant execute on function public.pay_contest_awards(uuid, uuid[], text, boolean)
  to service_role;

-- ============================================================================
-- 5. settle_contest, which no longer moves money
-- ============================================================================
/*
 * CLOSING A CONTEST IS NOT A PAYMENT ANY MORE, and the old signature has to go
 * rather than be replaced, because a function that still accepts `p_outcomes`
 * is a function somebody will pass outcomes to and be quietly ignored.
 *
 *   settle_contest(actor, contest, outcomes jsonb, note, allow_suspended)
 *     -> settle_contest(actor, contest, message)
 *
 * `create or replace` cannot do that: a different argument list makes a new
 * function rather than a replacement, and both would exist. Dropped by its full
 * old signature, exactly as save_contest_deliverable was on 2026-08-14.
 *
 * THE NAME STAYS, AGAINST THE FIRST INSTINCT TO RENAME IT TO close_contest.
 * `contests.settled_at`, `contests.settled_by`, the `settled` entry event, the
 * `contest.settled` audit action and rules L9 to L13 all say settled. A
 * function renamed on its own would be the only thing in the feature using a
 * different word for the same fact, which is worse than a word that has shifted
 * meaning in one documented place. The admin screen says "Close this contest",
 * which is what an admin should read.
 *
 * WHAT IT STILL DOES: refuses to close a contest twice, refuses a cancelled
 * one, refuses while entries are pending (rule L12, an applicant left pending
 * on a dead contest is in no queue and gets no decision), and writes every
 * approved entrant a history row so nobody is left at `approved` on a finished
 * contest with nothing saying what happened (rule L13).
 *
 * WHAT IT REFUSES THAT IT DID NOT BEFORE: a contest with a PROGRESS CLAIM still
 * pending. That claim can never be confirmed after closing, and confirming is
 * the only thing that can owe a creator money, so closing over the top of one
 * silently cancels a reward somebody has already earned. It is the single most
 * expensive thing this function could be allowed to do and it is now refused
 * with the count in the message.
 *
 * WHAT IT NO LONGER DOES: award anything, check a budget, or ask about
 * suspended accounts. Those all moved to the two moments that actually own
 * them, confirmation and payment. It does REPORT what is still unpaid, so the
 * screen can warn before closing rather than after.
 */
drop function if exists public.settle_contest(uuid, uuid, jsonb, text, boolean);

create or replace function public.settle_contest(
  p_actor_id uuid,
  p_contest_id uuid,
  -- THE CREATOR READS THIS, on their own entry timeline.
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_row      public.contests%rowtype;
  v_brand    public.brands%rowtype;
  v_entry    public.contest_entries%rowtype;
  v_message  text := nullif(trim(coalesce(p_message, '')), '');
  v_count    integer;
  v_entrants integer := 0;
  v_awarded  numeric := 0;
  v_owed     numeric := 0;
  v_owed_n   integer := 0;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  -- The lock that makes closing serial. Everything below counts under it.
  select * into v_row from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;
  if v_row.settled_at is not null then
    raise exception 'that contest has already been closed' using errcode = '55006';
  end if;
  if v_row.cancelled_at is not null then
    raise exception 'that contest was cancelled' using errcode = '22023';
  end if;

  -- L12.
  select count(*) into v_count
  from public.contest_entries e
  where e.contest_id = p_contest_id and e.status = 'pending';

  if v_count > 0 then
    raise exception
      'creators are still waiting on this contest, decide those % entry(ies) first', v_count
      using errcode = '23503';
  end if;

  -- The new one, and the expensive one. A pending claim is a reward that has
  -- possibly been earned and can never now be confirmed.
  select count(*) into v_count
  from public.contest_progress_updates u
  join public.contest_entries e on e.id = u.entry_id
  where e.contest_id = p_contest_id and u.status = 'pending';

  if v_count > 0 then
    raise exception
      '% claim(s) are still waiting to be confirmed, and closing would mean they never can be. Clear the claims first',
      v_count
      using errcode = '23503';
  end if;

  select * into v_brand from public.brands where id = v_row.brand_id;

  -- L13. Everybody who was in it learns it is over, on their own timeline.
  for v_entry in
    select * from public.contest_entries
    where contest_id = p_contest_id and status = 'approved'
    order by created_at
  loop
    insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
    values (v_entry.id, v_entry.creator_id, 'settled', v_message, v_actor.id);
    v_entrants := v_entrants + 1;
  end loop;

  -- What this contest actually cost, read off the bill rather than recomputed.
  select
    coalesce(sum(w.awarded_amount), 0),
    coalesce(sum(w.awarded_amount) filter (where w.paid_at is null), 0),
    count(*) filter (where w.paid_at is null)
  into v_awarded, v_owed, v_owed_n
  from public.contest_awards w
  where w.contest_id = p_contest_id;

  update public.contests
  set settled_at = now(), settled_by = v_actor.id
  where id = p_contest_id
  returning * into v_row;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.settled', 'contest', v_row.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_row.brand_id,
      'contest', v_row.name,
      'entrants', v_entrants,
      'awarded', v_awarded,
      'still_owed', nullif(v_owed, 0),
      'currency', v_row.currency,
      'message', v_message
    ))
  );

  /*
   * IT DOES NOT REFUSE WHILE MONEY IS STILL OWED, deliberately. Closing is a
   * statement about the contest; paying is a statement about the money, and
   * those genuinely do finish at different times. The count comes back so the
   * screen can say "closing this leaves $850 still owed to 3 creators" BEFORE
   * the click, and pay_contest_awards keeps working on a closed contest.
   */
  return to_jsonb(v_row) || jsonb_build_object(
    'entrants', v_entrants,
    'awarded', v_awarded,
    'still_owed', v_owed,
    'still_owed_count', v_owed_n
  );
end;
$$;

comment on function public.settle_contest(uuid, uuid, text) is
  'Closes a contest. It moves no money: rewards are owed the moment staff confirm the figures that earn them, and paid through pay_contest_awards, both of which keep working afterwards. Refuses while any entry OR any progress claim is still pending, because a claim that can never be confirmed is a reward silently cancelled. Reports what is still unpaid rather than refusing on it.';

revoke all on function public.settle_contest(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.settle_contest(uuid, uuid, text) to service_role;

-- ============================================================================
-- 6. The money, rolled up, still never added to an offer figure
-- ============================================================================
/*
 * STAFF ONLY IN THE BODY, the same gate contest_totals carries and for the same
 * reason: the grouping key here belongs to many people at once, so
 * security_invoker alone would hand a creator a sum of their own rows dressed
 * up as the contest's total. is_service_role() is in the gate because
 * service_role carries no user_role claim, so is_staff() is FALSE for the
 * service key and every Edge Function would read zero rows.
 *
 * A creator needs none of this. They read their own contest_awards rows through
 * contest_awards_select_own and add up three numbers on their own screen.
 */
create view public.contest_award_totals
with (security_invoker = true) as
select
  w.contest_id,
  c.brand_id,
  w.awarded_currency                                as currency,
  count(*)::int                                     as awards,
  count(*) filter (where w.paid_at is null)::int    as awards_owed,
  count(*) filter (where w.paid_at is not null)::int as awards_paid,
  count(distinct w.creator_id)::int                 as creators,
  coalesce(sum(w.awarded_amount), 0)::numeric(14, 2) as awarded,
  coalesce(sum(w.awarded_amount) filter (where w.paid_at is null), 0)::numeric(14, 2)     as owed,
  coalesce(sum(w.awarded_amount) filter (where w.paid_at is not null), 0)::numeric(14, 2) as paid,
  min(w.created_at) filter (where w.paid_at is null) as owed_since
from public.contest_awards w
join public.contests c on c.id = w.contest_id
where (select public.is_staff() or public.is_service_role())
group by w.contest_id, c.brand_id, w.awarded_currency;

comment on view public.contest_award_totals is
  'What one contest has actually cost, split into owed and paid, grouped by contest and currency. Staff only in the body. Read alongside contest_commercials.total_budget to show a percentage; the budget is deliberately not in here, because a percentage of an unknown allocation plus one known reward reconstructs the allocation.';

grant select on public.contest_award_totals to authenticated;
grant all privileges on table public.contest_award_totals to service_role;

/*
 * brand_contest_totals gains the same split. Its promise is unchanged and is
 * rule M10: a brand's contest money is shown BESIDE its offer money on every
 * surface, in its own labelled block, never added into the offer figure and
 * never left off. `committed` is what we have promised entrants; `awarded` is
 * what they have earned; `paid` is what has gone out. Three columns, three
 * facts, and brand_commercials.budget_used still means offers only.
 */
create or replace view public.brand_contest_totals
with (security_invoker = true) as
select
  t.brand_id,
  t.currency,
  count(distinct t.contest_id)::int               as contests,
  sum(t.entries_pending)::int                     as entries_pending,
  sum(t.entries_approved)::int                    as entries_approved,
  sum(t.committed)::numeric(14, 2)                as committed,
  coalesce(sum(a.awarded), 0)::numeric(14, 2)     as awarded,
  coalesce(sum(a.owed), 0)::numeric(14, 2)        as owed,
  coalesce(sum(a.paid), 0)::numeric(14, 2)        as paid
from public.contest_totals t
left join lateral (
  select
    sum(w.awarded_amount)                                       as awarded,
    sum(w.awarded_amount) filter (where w.paid_at is null)       as owed,
    sum(w.awarded_amount) filter (where w.paid_at is not null)   as paid
  from public.contest_awards w
  where w.contest_id = t.contest_id and w.awarded_currency = t.currency
) a on true
group by t.brand_id, t.currency;

comment on view public.brand_contest_totals is
  'A brand''s contest money and entry counts, grouped by brand and currency. Reads contest_totals, so it inherits that view''s staff-only gate. Committed, awarded, owed and paid are separate columns because they are separate facts with separate moments of truth, and none of them is ever added into brand_commercials.budget_used, which keeps meaning offers only.';

grant select on public.brand_contest_totals to authenticated;
grant all privileges on table public.brand_contest_totals to service_role;

-- ============================================================================
-- 7. The backfill, because three creators have already earned money
-- ============================================================================
/*
 * WITHOUT THIS, THREE PEOPLE ON DEV ARE OWED NOTHING FOR WORK ALREADY
 * CONFIRMED. Progress was confirmed on 2026-08-13, before a reward could be
 * owed by anything, so the figures cross targets and no bill exists. Running
 * the same writer over the latest confirmed figures produces exactly what
 * confirming them today would have produced.
 *
 * The event note says what happened rather than pretending the money was owed
 * at the time, because a creator reading their own timeline should not find a
 * reward apparently granted three weeks before the feature existed.
 *
 * Idempotent by construction: award_reached_terms writes nothing for a term
 * that already has a row, so running this twice is a no-op. It is written as a
 * backfill rather than a one-off script for the same reason every schema change
 * here is a migration: prod has never seen a contest, and this file has to be
 * the thing that makes prod correct when it does.
 */
do $$
declare
  r record;
begin
  for r in
    select
      e.id as entry_id,
      u.gmv,
      u.video_count,
      u.confirmed_by
    from public.contest_entries e
    join lateral (
      select u.gmv, u.video_count, u.confirmed_by
      from public.contest_progress_updates u
      where u.entry_id = e.id and u.status = 'confirmed'
      order by u.created_at desc, u.id desc
      limit 1
    ) u on true
    where e.status = 'approved'
  loop
    perform private.award_reached_terms(
      r.entry_id, r.gmv, r.video_count, r.confirmed_by,
      'Earned from progress already confirmed, and recorded when contest rewards were switched on.'
    );
  end loop;
end $$;
