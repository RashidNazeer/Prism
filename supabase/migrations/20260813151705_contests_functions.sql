/*
 * Contests: everything that writes to them, and nothing that shapes them.
 *
 * The companion to 20260813151702_contests_schema.sql, which created eleven
 * tables, every policy, every grant and three shared definitions, and left them
 * readable and inert. This file is the other half: the eighteen write functions
 * from section 2.13 of docs/CONTESTS_PLAN.md, plus one existing function that
 * has to learn about contests before contests exist.
 *
 * THE SHAPE EVERY ONE OF THEM SHARES, because it is the reason none of the
 * eleven tables has an insert, update or delete policy:
 *
 *   security definer, set search_path = ''      nothing resolves by accident
 *   assert_active_staff / assert_active_creator first line, always
 *   the row taken `for update` BEFORE any branch decides anything
 *   the audit row written in the SAME transaction, so a refusal takes it
 *   returns to_jsonb(v_row)
 *
 * ONE of the eighteen breaks the audit half of that on purpose, and it is the
 * last one in the file: set_contest_entry_target writes no audit row and no
 * event row, because both of those tables are staff readable and the number it
 * writes is the one number in this feature staff must never see. The block on
 * that function says it at length.
 *
 * THREE THINGS THIS FILE REFUSES TO CONTAIN, and they are decisions rather than
 * omissions:
 *
 * 1. THERE IS NO remove_contest_entry, AND THERE MUST NEVER BE ONE. An entry,
 *    once made, cannot be revoked by an admin at all (Q7, rule X9, ruled by
 *    Rashid on 2026-08-13). A creator withdrawing themselves before they have
 *    filed anything is a different act and does exist, below. The levers that
 *    remain for a bad actor are rejecting their work, awarding them nothing at
 *    settlement, and cancelling the whole contest, which is deliberately blunt.
 *    docs/CONTESTS_PLAN.md 3.4.1 records the risk that decision accepts so that
 *    nobody adds a removal action back as an obvious missing piece.
 *
 * 2. THERE IS NO DRAFT. save_contest either writes a legal contest or raises
 *    (Q12, rule F12). A half filled form lives in the admin's own browser and
 *    touches no row, which is why nothing here, no policy and no view needs a
 *    clause excluding a contest that was never finished.
 *
 * 3. NOTHING GENERATES A REWARD ROW TITLE, EVER (Q11, rule F11). Not a default,
 *    not a fallback, not a composed sentence from the row's own numbers. A
 *    blank or whitespace title is refused here as well as by the column check,
 *    because the words on a frozen promise have to be the admin's words.
 *
 * WHAT FREEZES, AND WHERE. At approval, immediately under auto approve or at
 * the admin's decision under manual review, every active deliverable is COPIED
 * onto contest_entry_terms and the fixed money onto committed_amount and
 * committed_video_count (rule F1). Nothing outside apply_for_contest and
 * review_contest_entry writes that table, and no edit path may ever update it:
 * an admin re-pricing a prize on Friday must not rewrite what somebody was
 * promised on Monday. The admin half of exactly that bug already shipped once,
 * at src/routes/admin/OfferRequests.tsx:419-431.
 *
 * S3, and it costs nothing today: every function here is new, so none of them
 * needs a `drop function` first. The moment one of these argument lists CHANGES
 * it does, or the looser old signature survives, still granted to service_role,
 * and a stale deployment binds to it.
 */

-- ============================================================================
-- 1. save_contest
-- ============================================================================
/*
 * The whole contest in one door, create and edit, exactly as save_offer is.
 *
 * FOUR REFUSALS LIVE HERE AND NOWHERE ELSE, because a CHECK constraint cannot
 * do any of them:
 *
 *   THE TIMEZONE. Validated against pg_timezone_names, which is a catalogue
 *   lookup and therefore not immutable, so Postgres will not accept it in a
 *   CHECK (rule L6, gap 2). Zod restricts the field to the list the form offers
 *   on both sides, which is a convenience. This is the boundary.
 *
 *   THE JUDGING SENTENCE. A contest carrying any ACTIVE deliverable of the
 *   `rank` kind must say how it is judged, and a check constraint cannot see
 *   another table (rule N7). Enforced in BOTH directions, because either one
 *   creates the illegal state on its own: here, when the sentence is cleared
 *   while ranked rows exist, and in save_contest_deliverable, when a ranked row
 *   is added while the sentence is blank. A RETIRED ranked row does not count,
 *   in either place: a sentence with nothing ranked is legal and harmless.
 *
 *   THE DEADLINE MOVING BACKWARDS. Refused while anybody is pending or
 *   approved (rule L11). Ending a contest early is Cancel or Settle, both of
 *   which write a per entrant outcome; backdating the expiry would strand
 *   entrants in a state the product has no name for.
 *
 *   THE BUDGET. The sum of active fixed rewards may not exceed the contest's
 *   total budget (rule M7). This is a typo check rather than a running total
 *   check: approving is never blocked for going over budget, but a single prize
 *   arithmetically larger than the whole pot on the day it is typed is a
 *   mistake nobody finds until somebody is owed it.
 *
 * EDITING IS TWO TIERS, AND THE TIER DECIDES THE REFUSAL RATHER THAN THE
 * PRESENCE OF ENTRIES (rule F2). A blanket freeze is wrong: on an auto approve
 * contest the first entry carries frozen terms within seconds of publishing, so
 * the contest would freeze almost immediately and a typo in a description could
 * never be fixed. Frozen once any entry carries frozen terms: currency,
 * brand_id, and moving the expiry into the past. Always allowed and always
 * audited: name, description, brief_url, banner_url, judging_basis, the product
 * list, needs_admin_approval, and extending the expiry.
 *
 * expires_at AND expires_at_timezone MOVE TOGETHER, always, which is why both
 * are required arguments rather than one required and one optional. They are
 * one fact. Editing the zone alone either silently moves the instant for
 * everybody already entered, or worse does not move it and re-labels it, so a
 * deadline that was 11:59pm BST starts reading 6:59pm EDT and nobody typed a
 * new time.
 */

create or replace function public.save_contest(
  p_actor_id uuid,
  p_brand_id uuid,
  p_name text,
  p_expires_at timestamptz,
  p_expires_at_timezone text,
  p_contest_id uuid default null,
  p_description text default null,
  p_judging_basis text default null,
  p_brief_url text default null,
  p_banner_url text default null,
  p_opens_at timestamptz default null,
  p_currency text default 'USD',
  p_status public.contest_status default 'inactive',
  p_needs_admin_approval boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_brand    public.brands%rowtype;
  v_before   public.contests%rowtype;
  v_contest  public.contests%rowtype;
  v_name     text := nullif(trim(coalesce(p_name, '')), '');
  v_desc     text := nullif(trim(coalesce(p_description, '')), '');
  v_judging  text := nullif(trim(coalesce(p_judging_basis, '')), '');
  v_brief    text := nullif(trim(coalesce(p_brief_url, '')), '');
  v_banner   text := nullif(trim(coalesce(p_banner_url, '')), '');
  v_zone     text := nullif(trim(coalesce(p_expires_at_timezone, '')), '');
  v_currency text := upper(coalesce(nullif(trim(coalesce(p_currency, '')), ''), 'USD'));
  v_opens    timestamptz;
  v_ranks    integer;
  v_live     integer;
  v_rewards  numeric;
  v_budget   numeric;
  v_action   text;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if v_name is null then
    raise exception 'a contest needs a name' using errcode = '22023';
  end if;
  if p_expires_at is null then
    raise exception 'a contest needs a deadline' using errcode = '22023';
  end if;
  if v_zone is null then
    raise exception 'a deadline needs the timezone it was set in' using errcode = '22023';
  end if;

  /*
   * The zone, against the catalogue. An offset like '+01:00' and an
   * abbreviation like 'BST' both look plausible and both fail here, which is
   * the point: an offset is wrong twice a year, and 'BST' is ambiguous between
   * British Summer Time and Bougainville Standard Time.
   */
  if not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = v_zone
  ) then
    raise exception '% is not a timezone we can store a deadline in', v_zone
      using errcode = '22023';
  end if;

  select * into v_brand from public.brands where id = p_brand_id;
  if not found then
    raise exception 'no such brand' using errcode = 'P0002';
  end if;

  if p_contest_id is null then
    v_opens := coalesce(p_opens_at, now());

    if p_expires_at <= v_opens then
      raise exception 'a contest has to close after it opens' using errcode = '22023';
    end if;

    /*
     * No N7 check and no M7 check on the create path, and that is not an
     * oversight: a contest that does not exist yet carries no deliverables, so
     * there is no ranked row to need a sentence and no reward to exceed a
     * budget. Both arrive with the first save_contest_deliverable call, which
     * carries both refusals.
     */
    insert into public.contests (
      brand_id, name, description, judging_basis, brief_url, banner_url,
      status, needs_admin_approval, opens_at, expires_at, expires_at_timezone,
      currency, created_by
    )
    values (
      p_brand_id, v_name, v_desc, v_judging, v_brief, v_banner,
      coalesce(p_status, 'inactive'), coalesce(p_needs_admin_approval, true),
      v_opens, p_expires_at, v_zone, v_currency, v_actor.id
    )
    returning * into v_contest;

    v_action := 'contest.created';
  else
    /*
     * Locked before ANY branch decides anything. Every count below, the ranked
     * rows, the live entrants and the reward total, is taken under this lock,
     * so two admins editing one contest cannot each read a state the other is
     * halfway through leaving.
     *
     * Matched on brand_id as well as id. contests.brand_id is never updatable
     * (rule F6): a contest moving between brands would silently spend one
     * brand's budget on another brand's products, and the composite foreign key
     * on contest_products would be the only thing left standing in the way.
     */
    select * into v_before
    from public.contests
    where id = p_contest_id and brand_id = p_brand_id
    for update;

    if not found then
      raise exception 'no such contest on that brand' using errcode = 'P0002';
    end if;

    v_opens := coalesce(p_opens_at, v_before.opens_at);

    if p_expires_at <= v_opens then
      raise exception 'a contest has to close after it opens' using errcode = '22023';
    end if;

    -- Terminal means terminal. Past settlement there is no extension, because
    -- a late submission would otherwise change who won after prizes were
    -- announced (rules L9, L10).
    if p_expires_at <> v_before.expires_at then
      if v_before.settled_at is not null then
        raise exception 'that contest has been settled, so its deadline cannot move'
          using errcode = '22023';
      end if;
      if v_before.cancelled_at is not null then
        raise exception 'that contest was cancelled, so its deadline cannot move'
          using errcode = '22023';
      end if;
    end if;

    -- L11. Extending an expired but unsettled contest is fine and audited;
    -- pulling the deadline back to now or earlier while people are in it is
    -- not, however innocent the typo looked.
    if p_expires_at <> v_before.expires_at and p_expires_at <= now() then
      select count(*) into v_live
      from public.contest_entries e
      where e.contest_id = p_contest_id and e.status in ('pending', 'approved');

      if v_live > 0 then
        raise exception
          '% creator(s) are in this contest, so the deadline cannot move into the past, end it with Cancel or Settle',
          v_live
          using errcode = '22023';
      end if;
    end if;

    -- F2, the frozen tier. The currency is the dimension every frozen promise
    -- was quoted in, so it stops being editable the moment one exists.
    if v_currency <> v_before.currency and exists (
      select 1
      from public.contest_entry_terms t
      join public.contest_entries e on e.id = t.entry_id
      where e.contest_id = p_contest_id
    ) then
      raise exception
        'somebody has already been promised something in %, so the currency cannot change now',
        v_before.currency
        using errcode = '22023';
    end if;

    /*
     * N7, this direction: the sentence is being cleared while ranked prizes are
     * still live. The count is in the message because "add a sentence" is not
     * actionable on a contest with six reward rows and the admin needs to know
     * how many of them are placings.
     */
    if v_judging is null then
      select count(*) into v_ranks
      from public.contest_deliverables d
      where d.contest_id = p_contest_id and d.is_active and d.kind = 'rank';

      if v_ranks > 0 then
        raise exception
          'this contest has % ranked prize rows, so it needs a sentence saying how it is judged',
          v_ranks
          using errcode = '22023';
      end if;
    end if;

    -- M7, under the lock this function already holds. Re-checked here as well
    -- as in save_contest_deliverable because lowering nothing and raising
    -- nothing still has to agree with the budget the contest carries today.
    select coalesce(sum(d.reward_amount), 0) into v_rewards
    from public.contest_deliverables d
    where d.contest_id = p_contest_id and d.is_active and d.kind = 'fixed';

    select c.total_budget into v_budget
    from public.contest_commercials c
    where c.contest_id = p_contest_id;

    if v_budget is not null and v_rewards > v_budget then
      raise exception
        'the fixed rewards on this contest add up to % %, which is more than the % % budget',
        v_rewards, v_currency, v_budget, v_currency
        using errcode = '22023';
    end if;

    update public.contests
    set name                 = v_name,
        description          = v_desc,
        judging_basis        = v_judging,
        brief_url            = v_brief,
        banner_url           = v_banner,
        status               = coalesce(p_status, v_before.status),
        needs_admin_approval = coalesce(p_needs_admin_approval, v_before.needs_admin_approval),
        opens_at             = v_opens,
        expires_at           = p_expires_at,
        expires_at_timezone  = v_zone,
        currency             = v_currency
    -- brand_id is deliberately absent from this SET list. See rule F6 and the
    -- matched select above.
    where id = p_contest_id
    returning * into v_contest;

    v_action := 'contest.updated';
  end if;

  /*
   * The audit detail carries the deadline AND its zone together, for the same
   * reason the two columns move together: one without the other is a different
   * moment, and the activity log is where somebody goes to find out what a
   * deadline used to say.
   *
   * has_banner and has_judging_basis are booleans rather than the values,
   * because jsonb_strip_nulls removes a cleared field entirely and "who took
   * the artwork down" is exactly the question the log is being asked.
   */
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, v_action, 'contest', v_contest.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'name', v_contest.name,
      'status', v_contest.status::text,
      'needs_admin_approval', v_contest.needs_admin_approval,
      'opens_at', v_contest.opens_at,
      'expires_at', v_contest.expires_at,
      'expires_at_timezone', v_contest.expires_at_timezone,
      'currency', v_contest.currency,
      'judging_basis', v_contest.judging_basis,
      'has_judging_basis', v_contest.judging_basis is not null,
      'brief_url', v_contest.brief_url,
      'banner_url', v_contest.banner_url,
      'has_banner', v_contest.banner_url is not null
    ))
  );

  return to_jsonb(v_contest);
end;
$$;

-- ============================================================================
-- 2. set_contest_status
-- ============================================================================
/*
 * The switch that closes the door, and NOTHING else (rules L1, L8, L17).
 *
 * Inactive means no new entrant may enter. It does not mean the work stops: an
 * approved entrant still reads their terms, still submits and is still paid,
 * which is why submit_contest_content deliberately does not look at this
 * column. One control, one axis. The bug this avoids already shipped once for
 * offers and was fixed by 20260801152000_read_offers_you_asked_for.sql.
 */

create or replace function public.set_contest_status(
  p_actor_id uuid,
  p_contest_id uuid,
  p_status public.contest_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.contests%rowtype;
  v_brand public.brands%rowtype;
  v_from  public.contest_status;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_row from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;

  if v_row.settled_at is not null then
    raise exception 'that contest has been settled' using errcode = '22023';
  end if;
  if v_row.cancelled_at is not null then
    raise exception 'that contest was cancelled' using errcode = '22023';
  end if;

  v_from := v_row.status;
  if v_from = p_status then
    -- Not an error, just nothing to do. Saying so beats writing an audit row
    -- that records no change, which is the shape set_offer_stage already uses.
    return to_jsonb(v_row);
  end if;

  update public.contests
  set status = p_status
  where id = p_contest_id
  returning * into v_row;

  select * into v_brand from public.brands where id = v_row.brand_id;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.status_changed',
    'contest', v_row.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_row.brand_id,
      'contest', v_row.name,
      'from', v_from::text,
      'to', v_row.status::text
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 3. settle_contest
-- ============================================================================
/*
 * The second money event, and the only one that knows who won.
 *
 * A rank cannot be known at approval, so ranked and milestone rewards commit
 * HERE rather than there, into contest_awards, with their own snapshot of the
 * amount and the currency (rule M8).
 *
 * WHAT IT COLLECTS IS AN OUTCOME FOR EVERY APPROVED ENTRANT, not a list of
 * winners, and that is D7 rather than a preference. Every fact about other
 * entrants is off every creator surface, and the one thing kept is a creator's
 * own placing, because it is their own result and names nobody. A placing
 * cannot be derived on a creator's screen without a ranking, and a ranking is
 * the exact object that is forbidden to exist, so the placing is a STORED FACT
 * about one entry, written for everybody rather than only for the paid, or the
 * fifth place finisher has nothing to read.
 *
 * p_outcomes is a jsonb array, one element per approved entry:
 *
 *   [{ "entry_id": uuid,
 *      "placement": 5 | null,
 *      "term_ids":  [uuid, ...],
 *      "note":      "..." }]
 *
 * NOTHING IN THAT PAYLOAD IS MONEY, deliberately (rule M9). The amount and the
 * currency come from the frozen contest_entry_terms row named by term_id, read
 * here under the contest lock, so every payment traces back to a sentence the
 * creator agreed to and a client cannot commit a figure nobody promised.
 *
 * DOUBLE CLICK. This project has no idempotency keys anywhere. The guards are
 * the contest row lock, the settled_at check under it, and
 * contest_awards_outcome_idx, which is a partial unique index rather than a
 * table constraint because Postgres treats NULLs as distinct in a constraint
 * and two clicks would otherwise have written two outcome rows per entrant and
 * told nobody.
 */

create or replace function public.settle_contest(
  p_actor_id uuid,
  p_contest_id uuid,
  p_outcomes jsonb,
  p_note text default null,
  -- A suspended entrant is refused money unless somebody says so out loud
  -- (rule S8). They keep their entry, their terms and their placing either way.
  p_allow_suspended boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     public.profiles%rowtype;
  v_row       public.contests%rowtype;
  v_brand     public.brands%rowtype;
  v_entry     public.contest_entries%rowtype;
  v_term      public.contest_entry_terms%rowtype;
  v_outcome   jsonb;
  v_outcomes  jsonb := coalesce(p_outcomes, '[]'::jsonb);
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_row_note  text;
  v_term_id   uuid;
  v_place     integer;
  v_entry_sum numeric;
  v_total     numeric := 0;
  v_entrants  integer := 0;
  v_count     integer;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if jsonb_typeof(v_outcomes) <> 'array' then
    raise exception 'settlement needs an outcome for every entrant' using errcode = '22023';
  end if;

  -- The lock that makes settlement serial. Everything below counts under it.
  select * into v_row from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;
  if v_row.settled_at is not null then
    raise exception 'that contest has already been settled' using errcode = '55006';
  end if;
  if v_row.cancelled_at is not null then
    raise exception 'that contest was cancelled' using errcode = '22023';
  end if;

  -- L12. Applicants must not be left pending forever on a settled contest, in
  -- no queue and getting no decision. Wording style of delete_offer.
  select count(*) into v_count
  from public.contest_entries e
  where e.contest_id = p_contest_id and e.status = 'pending';

  if v_count > 0 then
    raise exception
      'creators are still waiting on this contest, decide those % entry(ies) first', v_count
      using errcode = '23503';
  end if;

  -- One outcome per entry, and no entry twice. A repeated entry_id would be
  -- caught by contest_awards_outcome_idx as a duplicate key, which is a true
  -- refusal wearing an unreadable message.
  select count(*), count(distinct (o.value->>'entry_id')) into v_count, v_entrants
  from jsonb_array_elements(v_outcomes) o;

  if v_count <> v_entrants then
    raise exception 'one of those entrants is listed twice' using errcode = '22023';
  end if;

  -- A contest cannot half settle. Every approved entrant reads their own
  -- outcome row afterwards, so a missing one is a creator with nothing to read.
  select count(*) into v_count
  from public.contest_entries e
  where e.contest_id = p_contest_id
    and e.status = 'approved'
    and not exists (
      select 1 from jsonb_array_elements(v_outcomes) o
      where (o.value->>'entry_id')::uuid = e.id
    );

  if v_count > 0 then
    raise exception
      '% entrant(s) have no outcome yet, every approved entrant needs one before this can be settled',
      v_count
      using errcode = '22023';
  end if;

  select * into v_brand from public.brands where id = v_row.brand_id;

  for v_outcome in select o.value from jsonb_array_elements(v_outcomes) o loop
    v_place    := nullif(v_outcome->>'placement', '')::integer;
    v_row_note := nullif(trim(coalesce(v_outcome->>'note', '')), '');
    v_entry_sum := 0;

    select * into v_entry
    from public.contest_entries
    where id = (v_outcome->>'entry_id')::uuid and contest_id = p_contest_id
    for update;

    if not found then
      raise exception 'one of those entrants is not in this contest' using errcode = 'P0002';
    end if;
    if v_entry.status <> 'approved' then
      raise exception 'that entrant is %, so there is nothing to settle for them', v_entry.status
        using errcode = '22023';
    end if;

    /*
     * THE OUTCOME ROW. Written for everybody, worth zero, carrying the placing.
     * Keeping money off it is what stops brand_contest_totals double counting:
     * an entrant who placed first has an outcome row worth 0 and a money row
     * worth the prize, and sum(awarded_amount) is still the prize.
     */
    insert into public.contest_awards (
      contest_id, entry_id, creator_id, term_id, placement,
      awarded_amount, awarded_currency, note, awarded_by
    )
    values (
      p_contest_id, v_entry.id, v_entry.creator_id, null, v_place,
      0, v_row.currency, v_row_note, v_actor.id
    );

    -- THE MONEY ROWS. Attached to the frozen term they were promised by, never
    -- to a figure that arrived with the request.
    for v_term_id in
      select (t.value #>> '{}')::uuid
      from jsonb_array_elements(coalesce(v_outcome->'term_ids', '[]'::jsonb)) t
    loop
      select * into v_term
      from public.contest_entry_terms
      where id = v_term_id and entry_id = v_entry.id;

      if not found then
        raise exception 'that prize is not one of the things this entrant was promised'
          using errcode = 'P0002';
      end if;
      if coalesce(v_term.reward_amount, 0) <= 0 then
        raise exception '"%" carries no amount, so there is nothing to award for it', v_term.title
          using errcode = '22023';
      end if;

      -- S8. A suspended creator keeps everything they were promised and keeps
      -- their placing; paying one out is a decision somebody has to make on
      -- purpose rather than a row that slips through with the rest.
      if not coalesce(p_allow_suspended, false) and not exists (
        select 1 from public.profiles p where p.id = v_entry.creator_id and p.is_active
      ) then
        raise exception 'that entrant''s account is suspended, so their prize needs to be released on purpose'
          using errcode = '42501';
      end if;

      insert into public.contest_awards (
        contest_id, entry_id, creator_id, term_id, placement,
        awarded_amount, awarded_currency, note, awarded_by
      )
      values (
        p_contest_id, v_entry.id, v_entry.creator_id, v_term.id, null,
        v_term.reward_amount, v_term.currency, v_row_note, v_actor.id
      );

      v_entry_sum := v_entry_sum + v_term.reward_amount;
    end loop;

    v_total := v_total + v_entry_sum;

    -- L13. No entrant is left sitting at approved on a dead contest with
    -- nothing on their own history saying what happened.
    insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
    values (v_entry.id, v_entry.creator_id, 'settled', coalesce(v_row_note, v_note), v_actor.id);

    /*
     * A1: contest_entry.awarded fires once per ENTRANT rather than once per
     * winner, because settlement records a placing for everybody. It is the
     * busiest verb in the feature and most of its rows carry a zero.
     */
    insert into public.audit_log (
      actor_id, actor_email, actor_role, action, subject_type, subject_id,
      target_user_id, detail
    )
    values (
      v_actor.id, v_actor.email, v_actor.role, 'contest_entry.awarded',
      'contest_entry', v_entry.id, v_entry.creator_id,
      jsonb_strip_nulls(jsonb_build_object(
        'brand', v_brand.name,
        'brand_id', v_entry.brand_id,
        'contest', v_row.name,
        'contest_id', v_row.id,
        'creator', v_entry.creator_handle,
        'placement', v_place,
        'awarded', v_entry_sum,
        'currency', v_row.currency,
        'note', v_row_note
      ))
    );
  end loop;

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
      'awarded', v_total,
      'currency', v_row.currency,
      'allowed_suspended', coalesce(p_allow_suspended, false),
      'note', v_note
    ))
  );

  return to_jsonb(v_row) || jsonb_build_object('entrants', v_entrants, 'awarded', v_total);
end;
$$;

-- ============================================================================
-- 4. cancel_contest
-- ============================================================================
/*
 * The fire alarm, and it is deliberately blunt: it affects EVERY entrant rather
 * than one (3.4.1). Any screen offering it has to say so, because it is the
 * control somebody will reach for when they want one person out, and there is
 * no control that does that.
 *
 * It refuses while anybody is pending, for the same reason settlement does, and
 * it writes a history row for every live entrant so nobody's contest simply
 * stops existing on their dashboard one morning (rules L12, L13).
 */

create or replace function public.cancel_contest(
  p_actor_id uuid,
  p_contest_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  public.profiles%rowtype;
  v_row    public.contests%rowtype;
  v_brand  public.brands%rowtype;
  v_entry  public.contest_entries%rowtype;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_count  integer;
  v_live   integer := 0;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_row from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;
  if v_row.settled_at is not null then
    raise exception 'that contest has been settled' using errcode = '22023';
  end if;
  if v_row.cancelled_at is not null then
    raise exception 'that contest was already cancelled' using errcode = '55006';
  end if;

  select count(*) into v_count
  from public.contest_entries e
  where e.contest_id = p_contest_id and e.status = 'pending';

  if v_count > 0 then
    raise exception
      'creators are still waiting on this contest, decide those % entry(ies) first', v_count
      using errcode = '23503';
  end if;

  update public.contests
  set cancelled_at = now(), cancelled_by = v_actor.id, cancel_message = v_message
  where id = p_contest_id
  returning * into v_row;

  select * into v_brand from public.brands where id = v_row.brand_id;

  -- One history row per live entrant. The entry itself is left exactly as it
  -- is: approved, with its frozen terms intact, because nothing here voids a
  -- promise and there is no removal in this product.
  for v_entry in
    select * from public.contest_entries
    where contest_id = p_contest_id and status = 'approved'
  loop
    insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
    values (v_entry.id, v_entry.creator_id, 'contest_cancelled', v_message, v_actor.id);
    v_live := v_live + 1;
  end loop;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.cancelled', 'contest', v_row.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_row.brand_id,
      'contest', v_row.name,
      'entrants_affected', v_live,
      'message', v_message
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 5. delete_contest
-- ============================================================================
/*
 * A destructive action with two guards, and the second one is the interesting
 * one (rules L14, L17).
 *
 * It refuses while any entry is pending OR approved, even though the foreign
 * keys cascade, and it writes the audit row BEFORE the delete in the same
 * transaction so the record of what was owed survives the removal.
 *
 * Note the trap this inherits from delete_offer: the protection lives in this
 * function while the FK still cascades, so a direct service key delete would
 * sweep fourteen frozen promises away regardless. That is the argument for
 * contest_products carrying `on delete restrict` in the schema rather than
 * relying on a function refusal, and it is worth remembering the day somebody
 * writes a cleanup script.
 */

create or replace function public.delete_contest(p_actor_id uuid, p_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.contests%rowtype;
  v_brand public.brands%rowtype;
  v_open  integer;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_row from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;

  select count(*) into v_open
  from public.contest_entries e
  where e.contest_id = p_contest_id and e.status in ('pending', 'approved');

  if v_open > 0 then
    raise exception
      'creators are in this contest, settle or decide those % entry(ies) first', v_open
      using errcode = '23503';
  end if;

  select * into v_brand from public.brands where id = v_row.brand_id;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.deleted', 'contest', v_row.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_row.brand_id,
      'contest', v_row.name,
      'expires_at', v_row.expires_at,
      'expires_at_timezone', v_row.expires_at_timezone,
      'currency', v_row.currency,
      'status', v_row.status::text
    ))
  );

  delete from public.contests where id = p_contest_id;

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 6. save_contest_deliverable
-- ============================================================================
/*
 * One reward row, created or edited. Three kinds in one door, because a contest
 * may hold any mixture of them.
 *
 * THE TITLE IS TYPED, EVERY TIME, AND NOTHING HERE GENERATES ONE (Q11, rule
 * F11, decided by Rashid on 2026-08-13 against the recommendation). Not a
 * default, not a composed sentence from the row's own numbers, not a fallback
 * at render time. A title of spaces is what a form leaves behind when somebody
 * tabs through the field, so the trimmed refusal below is load bearing rather
 * than cosmetic: those words end up on every entrant's frozen promise, and they
 * have to be the admin's words rather than ours.
 *
 * N7, the other direction. A ranked prize on a contest with no sentence saying
 * how it is judged is refused here, because a CHECK constraint cannot see the
 * contests table and because either direction reaches the illegal state on its
 * own. retire_contest_deliverable carries no such clause on purpose.
 *
 * F2, the frozen tier. The four numbers that decide what somebody is owed,
 * reward_amount, video_count, rank_position and threshold, stop being editable
 * on an EXISTING row once any entry carries frozen terms. The title, the detail
 * and the sort order stay editable, because saying the same promise more
 * clearly changes nothing anybody agreed to. A new row may always be added, and
 * an old one may always be retired, which is what keeps an auto approve contest
 * from freezing solid seconds after it is published.
 */

create or replace function public.save_contest_deliverable(
  p_actor_id uuid,
  p_contest_id uuid,
  p_kind public.contest_deliverable_kind,
  p_title text,
  p_deliverable_id uuid default null,
  p_detail text default null,
  p_video_count integer default null,
  p_rank_position integer default null,
  p_metric text default null,
  p_threshold numeric default null,
  p_reward_amount numeric default null,
  p_sort_order integer default 0,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_contest  public.contests%rowtype;
  v_brand    public.brands%rowtype;
  v_before   public.contest_deliverables%rowtype;
  v_row      public.contest_deliverables%rowtype;
  v_title    text := nullif(trim(coalesce(p_title, '')), '');
  v_detail   text := nullif(trim(coalesce(p_detail, '')), '');
  v_metric   text := nullif(trim(coalesce(p_metric, '')), '');
  v_active   boolean := coalesce(p_is_active, true);
  v_frozen   boolean;
  v_rewards  numeric;
  v_budget   numeric;
  v_action   text;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  -- Nothing generates this. A row arriving with spaces in it is refused here,
  -- again in the Edge Function's Zod schema, and again by the column check.
  if v_title is null then
    raise exception 'that reward row needs a title, nothing writes one for you'
      using errcode = '22023';
  end if;

  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;
  if v_contest.settled_at is not null then
    raise exception 'that contest has been settled' using errcode = '22023';
  end if;
  if v_contest.cancelled_at is not null then
    raise exception 'that contest was cancelled' using errcode = '22023';
  end if;

  -- The same three shapes the table's check constraints carry, said in words
  -- somebody reading an admin screen can act on.
  if p_kind = 'fixed' and p_video_count is null then
    raise exception 'a fixed reward needs the number of videos it asks for'
      using errcode = '22023';
  end if;
  if p_kind = 'rank' and p_rank_position is null then
    raise exception 'a ranked prize needs the place it pays out for'
      using errcode = '22023';
  end if;
  if p_kind = 'milestone' and (v_metric is null or p_threshold is null) then
    raise exception 'a milestone needs what is being measured and the number to reach'
      using errcode = '22023';
  end if;

  /*
   * N7, this direction. A placing with no stated basis is the one thing that
   * would make a contest feel arbitrary, on the product whose promise is that
   * the numbers are real, and nothing in this product computes a placing yet.
   *
   * Only an ACTIVE ranked row triggers it. Retiring the last one leaves a
   * sentence with nothing ranked, which is legal.
   */
  if p_kind = 'rank' and v_active
     and nullif(trim(coalesce(v_contest.judging_basis, '')), '') is null then
    raise exception 'say how this contest is judged before you add a ranked prize'
      using errcode = '22023';
  end if;

  -- Two people cannot both be second. The partial unique index is the
  -- guarantee; this is the sentence, because a duplicate key error is not one.
  if p_kind = 'rank' and v_active and exists (
    select 1 from public.contest_deliverables d
    where d.contest_id = p_contest_id
      and d.kind = 'rank'
      and d.is_active
      and d.rank_position = p_rank_position
      and (p_deliverable_id is null or d.id <> p_deliverable_id)
  ) then
    raise exception 'this contest already has a prize for place %', p_rank_position
      using errcode = '23505';
  end if;

  select exists (
    select 1
    from public.contest_entry_terms t
    join public.contest_entries e on e.id = t.entry_id
    where e.contest_id = p_contest_id
  ) into v_frozen;

  if p_deliverable_id is null then
    insert into public.contest_deliverables (
      contest_id, kind, title, detail, video_count, rank_position,
      metric, threshold, reward_amount, sort_order, is_active
    )
    values (
      p_contest_id, p_kind, v_title, v_detail, p_video_count, p_rank_position,
      v_metric, p_threshold, p_reward_amount, coalesce(p_sort_order, 0), v_active
    )
    returning * into v_row;

    v_action := 'created';
  else
    select * into v_before
    from public.contest_deliverables
    where id = p_deliverable_id and contest_id = p_contest_id
    for update;

    if not found then
      raise exception 'no such reward row on that contest' using errcode = 'P0002';
    end if;

    /*
     * F2. Once somebody holds a frozen promise, the numbers on an existing row
     * are what they agreed to, and re-scoping them here would move the
     * goalposts on somebody already filming. Add a new row instead, or retire
     * this one: both are always allowed and both are audited.
     */
    if v_frozen and (
         coalesce(p_reward_amount, -1) is distinct from coalesce(v_before.reward_amount, -1)
      or coalesce(p_video_count, -1)   is distinct from coalesce(v_before.video_count, -1)
      or coalesce(p_rank_position, -1) is distinct from coalesce(v_before.rank_position, -1)
      or coalesce(p_threshold, -1)     is distinct from coalesce(v_before.threshold, -1)
      or p_kind                        is distinct from v_before.kind
    ) then
      raise exception
        'somebody has already been promised this reward as it stands, so add a new row instead of changing this one'
        using errcode = '22023';
    end if;

    update public.contest_deliverables
    set kind          = p_kind,
        title         = v_title,
        detail        = v_detail,
        video_count   = p_video_count,
        rank_position = p_rank_position,
        metric        = v_metric,
        threshold     = p_threshold,
        reward_amount = p_reward_amount,
        sort_order    = coalesce(p_sort_order, 0),
        is_active     = v_active
    where id = p_deliverable_id and contest_id = p_contest_id
    returning * into v_row;

    v_action := 'updated';
  end if;

  /*
   * M7, after the write and under the contest lock, so the figure quoted back
   * is the one the contest now carries. A single prize arithmetically larger
   * than the whole pot on the day it is typed is a typo, and nothing else in
   * the product would say so until somebody was owed it.
   */
  select coalesce(sum(d.reward_amount), 0) into v_rewards
  from public.contest_deliverables d
  where d.contest_id = p_contest_id and d.is_active and d.kind = 'fixed';

  select c.total_budget into v_budget
  from public.contest_commercials c
  where c.contest_id = p_contest_id;

  if v_budget is not null and v_rewards > v_budget then
    raise exception
      'the fixed rewards on this contest add up to % %, which is more than the % % budget',
      v_rewards, v_contest.currency, v_budget, v_contest.currency
      using errcode = '22023';
  end if;

  select * into v_brand from public.brands where id = v_contest.brand_id;

  /*
   * Audited as contest.updated rather than as a verb of its own, deliberately.
   * The registered verb list in rule A1 is closed, and a reward row is a change
   * to the contest: the subject an admin opens from the activity log is the
   * contest, not a row id they have never seen.
   */
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.updated', 'contest', v_contest.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'contest', v_contest.name,
      'reward_row', v_action,
      'kind', v_row.kind::text,
      'title', v_row.title,
      'video_count', v_row.video_count,
      'rank_position', v_row.rank_position,
      'metric', v_row.metric,
      'threshold', v_row.threshold,
      'reward_amount', v_row.reward_amount,
      'currency', v_contest.currency,
      'is_active', v_row.is_active
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 7. retire_contest_deliverable
-- ============================================================================
/*
 * Soft disable, never delete (rule F3). Entrants have snapshotted these rows
 * onto contest_entry_terms, and deleting one would leave a reward on the books
 * with nothing describing what it was for.
 *
 * NO JUDGING SENTENCE CLAUSE HERE, and that is the decision rather than an
 * omission: retiring the last ranked row leaves a contest with a sentence and
 * nothing ranked, which is legal and harmless. The requirement runs the other
 * way only.
 */

create or replace function public.retire_contest_deliverable(
  p_actor_id uuid,
  p_deliverable_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_row     public.contest_deliverables%rowtype;
  v_contest public.contests%rowtype;
  v_brand   public.brands%rowtype;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_row from public.contest_deliverables
  where id = p_deliverable_id for update;
  if not found then
    raise exception 'no such reward row' using errcode = 'P0002';
  end if;

  select * into v_contest from public.contests where id = v_row.contest_id for update;
  if v_contest.settled_at is not null then
    raise exception 'that contest has been settled' using errcode = '22023';
  end if;
  if v_contest.cancelled_at is not null then
    raise exception 'that contest was cancelled' using errcode = '22023';
  end if;

  if not v_row.is_active then
    -- Nothing to do, and nothing to record. Saying so beats an audit row that
    -- claims a change nobody made.
    return to_jsonb(v_row);
  end if;

  update public.contest_deliverables
  set is_active = false
  where id = p_deliverable_id
  returning * into v_row;

  select * into v_brand from public.brands where id = v_contest.brand_id;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.updated', 'contest', v_contest.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'contest', v_contest.name,
      'reward_row', 'retired',
      'kind', v_row.kind::text,
      'title', v_row.title,
      'reward_amount', v_row.reward_amount,
      'currency', v_contest.currency
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 8. set_contest_products
-- ============================================================================
/*
 * The whole product list at once, replaced rather than patched, because the
 * control is a multi select and a partial write would leave the screen and the
 * table disagreeing about what came off.
 *
 * Every product is snapshotted by name and external id, so deactivating or
 * renaming one never blanks the brief an entrant is working to. The composite
 * foreign key in the schema is what makes a product from another brand
 * impossible even by a direct service key write; the refusal below is what
 * makes it readable.
 */

create or replace function public.set_contest_products(
  p_actor_id uuid,
  p_contest_id uuid,
  p_product_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_contest  public.contests%rowtype;
  v_brand    public.brands%rowtype;
  v_ids      uuid[] := coalesce(p_product_ids, array[]::uuid[]);
  v_bad      integer;
  v_names    text[];
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;
  if v_contest.settled_at is not null then
    raise exception 'that contest has been settled' using errcode = '22023';
  end if;
  if v_contest.cancelled_at is not null then
    raise exception 'that contest was cancelled' using errcode = '22023';
  end if;

  -- Anything in the list that is not this brand's product. The composite FK
  -- would refuse it anyway, with a message nobody can act on.
  select count(*) into v_bad
  from unnest(v_ids) as wanted(id)
  where not exists (
    select 1 from public.brand_products p
    where p.id = wanted.id and p.brand_id = v_contest.brand_id
  );

  if v_bad > 0 then
    raise exception '% of those products do not belong to this brand', v_bad
      using errcode = '22023';
  end if;

  delete from public.contest_products
  where contest_id = p_contest_id
    and not (product_id = any (v_ids));

  insert into public.contest_products (
    contest_id, product_id, brand_id, product_name, external_product_id
  )
  select p_contest_id, p.id, p.brand_id, p.name, p.external_product_id
  from public.brand_products p
  where p.id = any (v_ids) and p.brand_id = v_contest.brand_id
  on conflict (contest_id, product_id) do update
    -- Re-snapshot on every save, so the brief follows a rename the admin has
    -- just made, and only ever at a moment an admin chose.
    set product_name        = excluded.product_name,
        external_product_id = excluded.external_product_id;

  select array_agg(cp.product_name order by cp.product_name) into v_names
  from public.contest_products cp
  where cp.contest_id = p_contest_id;

  select * into v_brand from public.brands where id = v_contest.brand_id;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.products_set',
    'contest', v_contest.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'contest', v_contest.name,
      'products', to_jsonb(coalesce(v_names, array[]::text[])),
      'count', coalesce(array_length(v_names, 1), 0)
    ))
  );

  return to_jsonb(v_contest) || jsonb_build_object(
    'products', to_jsonb(coalesce(v_names, array[]::text[]))
  );
end;
$$;

-- ============================================================================
-- 9. save_contest_commercials
-- ============================================================================
/*
 * The budget and the internal note, in their own door for the same reason
 * save_brand_about has one: the form that owns these two fields must not be
 * able to touch the contest's name, its deadline or its currency by sending a
 * stale copy of them back.
 *
 * There is no budget_used column here and there never will be. Every contest
 * money figure is derived by summing frozen entry rows through contest_totals,
 * and scripts/reconcile-budgets.mjs exists only because a maintained running
 * total drifted once already.
 *
 * THE THIRD DOOR INTO M7, which the plan names on save_contest only. Lowering
 * the budget under the rewards already promised reaches exactly the state rule
 * M7 refuses, from the other side, so it is refused here too with the same two
 * figures in the message. Nothing about contest money is allowed to be true on
 * one screen and false on another.
 */

create or replace function public.save_contest_commercials(
  p_actor_id uuid,
  p_contest_id uuid,
  p_total_budget numeric default null,
  p_internal_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_contest public.contests%rowtype;
  v_brand   public.brands%rowtype;
  v_row     public.contest_commercials%rowtype;
  v_note    text := nullif(trim(coalesce(p_internal_note, '')), '');
  v_rewards numeric;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;

  if p_total_budget is not null then
    select coalesce(sum(d.reward_amount), 0) into v_rewards
    from public.contest_deliverables d
    where d.contest_id = p_contest_id and d.is_active and d.kind = 'fixed';

    if v_rewards > p_total_budget then
      raise exception
        'the fixed rewards on this contest add up to % %, which is more than the % % budget',
        v_rewards, v_contest.currency, p_total_budget, v_contest.currency
        using errcode = '22023';
    end if;
  end if;

  insert into public.contest_commercials (contest_id, total_budget, internal_note)
  values (p_contest_id, p_total_budget, v_note)
  on conflict (contest_id) do update
    set total_budget  = excluded.total_budget,
        internal_note = excluded.internal_note
  returning * into v_row;

  select * into v_brand from public.brands where id = v_contest.brand_id;

  -- audit_log is staff only, so the budget is safe to record here, exactly as
  -- save_brand already records a brand's allocation.
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.updated', 'contest', v_contest.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'contest', v_contest.name,
      'total_budget', v_row.total_budget,
      'currency', v_contest.currency,
      'has_internal_note', v_row.internal_note is not null
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 10. save_contest_exclusion
-- ============================================================================
/*
 * Barring somebody from ONE contest, forward looking only.
 *
 * THIS FUNCTION TOUCHES NO ENTRY ROW OF ANY KIND, and that is rule X7 and the
 * whole of Q7. Adding an exclusion has no effect on an entry that already
 * exists: anybody already in stays in, keeps their frozen terms, keeps their
 * submission path and keeps their place at settlement. A gate that reached
 * backwards through a door somebody had already walked through would make a
 * mistyped handle destroy live work with one keystroke.
 *
 * THE ONLY DURABLE KEY IS A RESOLVED user_id (rule X3). A handle can be renamed
 * from the browser console, because applications.tiktok_handle carries a
 * standing column level UPDATE grant to authenticated, and profiles.email is
 * synced from auth.users when a creator changes it. So handle and email exist
 * to close the case where the person has no account yet, and this function
 * resolves them to a uuid the moment it can and PINS it. From then on only the
 * uuid is compared, by contest_excludes.
 */

create or replace function public.save_contest_exclusion(
  p_actor_id uuid,
  p_contest_id uuid,
  p_handle text default null,
  p_email text default null,
  p_user_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_contest public.contests%rowtype;
  v_brand   public.brands%rowtype;
  v_row     public.contest_exclusions%rowtype;
  v_handle   text := nullif(trim(coalesce(p_handle, '')), '');
  v_email    text := nullif(trim(coalesce(p_email, '')), '');
  v_reason   text := nullif(trim(coalesce(p_reason, '')), '');
  v_user     uuid := p_user_id;
  v_attempts integer := 0;
  v_last     timestamptz;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if v_handle is null and v_email is null and v_user is null then
    raise exception 'name somebody to bar: a handle, an email address or an account'
      using errcode = '22023';
  end if;

  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;

  /*
   * Resolve, and pin. An exclusion that has never resolved is the NORMAL case
   * rather than an error, because the usual reason to type a handle is that the
   * person has not signed up yet, and the admin screen says so in those words.
   */
  if v_user is null then
    select p.id into v_user
    from public.profiles p
    left join lateral (
      select a.tiktok_handle
      from public.applications a
      where a.user_id = p.id
      order by a.created_at desc
      limit 1
    ) h on true
    where (v_email is not null and lower(p.email) = lower(v_email))
       or (
         v_handle is not null
         and h.tiktok_handle is not null
         and lower(ltrim(h.tiktok_handle, '@')) = lower(ltrim(v_handle, '@'))
       )
    limit 1;
  end if;

  /*
   * FOLD THE OLDER KEY IN FIRST, and this is the case that would otherwise
   * break the day it mattered. There are THREE partial unique indexes on this
   * table, one per key, and an upsert can only name one of them. So an
   * exclusion typed as a handle in March, saved again in June once that person
   * has an account and the handle resolves, would arrive as a pinned row
   * carrying the same handle: the ON CONFLICT clause names the user index, the
   * duplicate lands on the HANDLE index, and the admin gets a raw duplicate key
   * error on a save that looks identical to the one that worked in March.
   *
   * The rows folded in are the same person under a weaker key, so they go, and
   * their attempts counter comes with them rather than being reset. That
   * counter is a fact about the person rather than about the key, and it is the
   * number Rashid asked for by name (rules X5, X10).
   */
  with folded as (
    delete from public.contest_exclusions x
    where x.contest_id = p_contest_id
      and case
            -- Keyed on the uuid: every unresolved row naming them folds in.
            when v_user is not null then x.user_id is null
            -- Keyed on the email: only handle-only rows are weaker than this.
            when v_email is not null then x.user_id is null and x.email is null
            -- Keyed on the handle: nothing is weaker, so nothing folds.
            else false
          end
      and (
        (v_email is not null and lower(coalesce(x.email, chr(1))) = lower(v_email))
        or (
          v_handle is not null
          and lower(ltrim(coalesce(x.handle, chr(1)), '@')) = lower(ltrim(v_handle, '@'))
        )
      )
    returning x.attempts, x.last_attempt_at
  )
  select coalesce(max(f.attempts), 0), max(f.last_attempt_at)
  into v_attempts, v_last
  from folded f;

  /*
   * Three shapes of upsert, one per partial unique index, because a row keyed
   * by a pinned uuid, a row keyed by an email and a row keyed by a handle are
   * three different rows and the index that protects each one is different.
   */
  if v_user is not null then
    insert into public.contest_exclusions (
      contest_id, handle, email, user_id, reason, created_by, attempts, last_attempt_at
    )
    values (p_contest_id, v_handle, v_email, v_user, v_reason, v_actor.id, v_attempts, v_last)
    on conflict (contest_id, user_id) where user_id is not null do update
      set handle          = coalesce(excluded.handle, contest_exclusions.handle),
          email           = coalesce(excluded.email, contest_exclusions.email),
          reason          = excluded.reason,
          attempts        = contest_exclusions.attempts + excluded.attempts,
          -- greatest ignores nulls, so a row that has never been tested keeps
          -- the other row's timestamp rather than blanking it.
          last_attempt_at = greatest(contest_exclusions.last_attempt_at, excluded.last_attempt_at)
    returning * into v_row;
  elsif v_email is not null then
    insert into public.contest_exclusions (
      contest_id, handle, email, user_id, reason, created_by, attempts, last_attempt_at
    )
    values (p_contest_id, v_handle, v_email, null, v_reason, v_actor.id, v_attempts, v_last)
    on conflict (contest_id, lower(email)) where email is not null do update
      set handle          = coalesce(excluded.handle, contest_exclusions.handle),
          reason          = excluded.reason,
          attempts        = contest_exclusions.attempts + excluded.attempts,
          last_attempt_at = greatest(contest_exclusions.last_attempt_at, excluded.last_attempt_at)
    returning * into v_row;
  else
    insert into public.contest_exclusions (
      contest_id, handle, email, user_id, reason, created_by
    )
    values (p_contest_id, v_handle, null, null, v_reason, v_actor.id)
    on conflict (contest_id, lower(handle)) where handle is not null do update
      set reason = excluded.reason
    returning * into v_row;
  end if;

  select * into v_brand from public.brands where id = v_contest.brand_id;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.exclusion_added',
    'contest', v_contest.id, v_row.user_id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'contest', v_contest.name,
      'handle', v_row.handle,
      'email', v_row.email,
      'resolved', v_row.user_id is not null,
      'reason', v_row.reason
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 11. remove_contest_exclusion
-- ============================================================================
-- Taking a name off the list. It touches no entry row either, in either
-- direction: removing a bar lets that person enter from now on and does nothing
-- retroactive, for the same reason adding one does nothing retroactive.

create or replace function public.remove_contest_exclusion(
  p_actor_id uuid,
  p_exclusion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_row     public.contest_exclusions%rowtype;
  v_contest public.contests%rowtype;
  v_brand   public.brands%rowtype;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_row from public.contest_exclusions
  where id = p_exclusion_id for update;
  if not found then
    raise exception 'no such exclusion' using errcode = 'P0002';
  end if;

  select * into v_contest from public.contests where id = v_row.contest_id;
  select * into v_brand from public.brands where id = v_contest.brand_id;

  -- Before the delete, in the same transaction, so the record of who was barred
  -- and why survives the removal.
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.exclusion_removed',
    'contest', v_contest.id, v_row.user_id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'contest', v_contest.name,
      'handle', v_row.handle,
      'email', v_row.email,
      'resolved', v_row.user_id is not null,
      'attempts', v_row.attempts,
      'reason', v_row.reason
    ))
  );

  delete from public.contest_exclusions where id = p_exclusion_id;

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 12. record_contest_exclusion_attempt
-- ============================================================================
/*
 * The counter behind rule X5, and the reason it is a separate function is rule
 * X4: apply_for_contest RAISES when somebody barred tries to enter, and a raise
 * aborts the transaction and would take any audit row with it. So the Edge
 * Function calls this AFTER the refusal has returned, in its own transaction,
 * exactly as every *.write_denied row is written today. No function in this
 * codebase writes an audit row and then raises.
 *
 * A COUNTER, NOT AN ENTRY ROW. An `excluded` entry status would sit outside the
 * partial unique index that bounds live entries, so nothing would limit how
 * many rows a barred creator could create by holding the button down, and they
 * would fill the very queue the exclusion exists to protect.
 *
 * IT TAKES NO NOTE AND NO FREE TEXT FROM THE CLIENT, and no actor either: the
 * person it records is the person who was refused, and the Edge Function knows
 * who that was because it just refused them.
 *
 * IT DOES NOT PIN A user_id, unlike save_contest_exclusion, and that is
 * deliberate rather than an inconsistency. Two unresolved rows, one typed as a
 * handle and one as an email, can both match the same person, and pinning both
 * would violate contest_exclusions_user_idx and raise inside the one call whose
 * whole job is to record that something happened. Losing the count is worse
 * than leaving the row unresolved, and the admin screen already flags it.
 */

create or replace function public.record_contest_exclusion_attempt(
  p_contest_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_who     public.profiles%rowtype;
  v_contest public.contests%rowtype;
  v_brand   public.brands%rowtype;
  v_handle  text;
  v_bumped  integer := 0;
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;

  select * into v_who from public.profiles where id = p_user_id;
  if not found then
    raise exception 'unknown actor' using errcode = '42501';
  end if;

  select a.tiktok_handle into v_handle
  from public.applications a
  where a.user_id = p_user_id
  order by a.created_at desc
  limit 1;

  -- The same comparison contest_excludes makes, with the same coalesce on both
  -- sides of every side of it: a creator with no application row has a NULL
  -- handle, and `null = 'x'` is NULL rather than false, so an OR chain without
  -- it matches everybody.
  update public.contest_exclusions x
  set attempts = x.attempts + 1,
      last_attempt_at = now()
  where x.contest_id = p_contest_id
    and (
      x.user_id = p_user_id
      or (
        x.user_id is null
        and (
          lower(coalesce(x.email, '')) = lower(coalesce(v_who.email, chr(1)))
          or lower(ltrim(coalesce(x.handle, ''), '@'))
               = lower(ltrim(coalesce(v_handle, chr(1)), '@'))
        )
      )
    );

  get diagnostics v_bumped = row_count;

  select * into v_brand from public.brands where id = v_contest.brand_id;

  /*
   * The verb is contest_entry.excluded_attempt, and the admin screen must call
   * it a BLOCKED ATTEMPT on the contest, never a click, a tap, an application
   * or a rejected request. There was no button, and there is no entry: nothing
   * renders an Apply control for somebody barred, so what happened here was a
   * call at the API by somebody holding an id. "3 blocked attempts", not "3
   * people tried to apply", or the next move is a hunt for a leak that does not
   * exist.
   */
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_who.id, v_who.email, v_who.role, 'contest_entry.excluded_attempt',
    'contest', v_contest.id, v_who.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'contest', v_contest.name,
      'creator', v_handle,
      'matched_exclusions', v_bumped
    ))
  );

  return jsonb_build_object('recorded', v_bumped);
end;
$$;

-- ============================================================================
-- 13. apply_for_contest
-- ============================================================================
/*
 * The creator's own act, and the first of the two that carry the weight.
 *
 * Every gate is re-checked here. Row security hiding a contest is cosmetic;
 * this is the boundary, because a creator who keeps an id can post straight at
 * the Edge Function and is exactly the person motivated to try.
 *
 * AUTO APPROVE IS ONE TRANSACTION, NOT A LIGHTER "JOINED" ROW. Being part of
 * the contest is being owed the reward, so the terms freeze, the event is
 * written and the audit row says approved, all before this returns. An
 * insert-pending-then-approve second call would leave half entered creators
 * sitting on a contest that has no review queue and an admin who does not know
 * to look.
 */

create or replace function public.apply_for_contest(
  p_actor_id uuid,
  p_contest_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_contest  public.contests%rowtype;
  v_brand    public.brands%rowtype;
  v_row      public.contest_entries%rowtype;
  v_handle   text;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_excluded boolean;
  v_amount   numeric := null;
  v_videos   integer := null;
begin
  -- role = 'creator' exactly. is_approved_creator() admits ops and admin so
  -- they can BROWSE; entering is a narrower gate on purpose (rule E6).
  v_actor := public.assert_active_creator(p_actor_id);

  -- Locked before ANY branch, so an admin flipping needs_admin_approval or the
  -- expiry between the card loading and this call cannot be raced.
  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;

  select * into v_brand from public.brands where id = v_contest.brand_id;

  -- Four distinct sentences, because "that did not work" on a contest a creator
  -- can see the card for is the refusal nothing on the screen can explain.
  if not public.contest_is_open(p_contest_id) then
    if v_contest.settled_at is not null then
      raise exception 'that contest has been settled' using errcode = '22023';
    elsif v_contest.cancelled_at is not null then
      raise exception 'that contest was cancelled' using errcode = '22023';
    elsif now() >= v_contest.expires_at then
      raise exception 'that contest closed on %',
        to_char(v_contest.expires_at at time zone 'UTC', 'DD Mon YYYY HH24:MI') || ' UTC'
        using errcode = '22023';
    elsif not v_brand.is_active then
      raise exception 'that brand is not open' using errcode = '22023';
    else
      raise exception 'that contest is not taking entries' using errcode = '22023';
    end if;
  end if;

  -- The handle is read from the database, NEVER from the request body.
  select a.tiktok_handle into v_handle
  from public.applications a
  where a.user_id = v_actor.id
  order by a.created_at desc
  limit 1;

  /*
   * Exclusion, through the ONE definition in the schema migration and not
   * spelled out again here. user_id is the only durable key; handle and email
   * only ever close the case where the exclusion was typed before that person
   * had an account. The coalesce on both sides of every comparison lives inside
   * contest_excludes, and it is load bearing.
   *
   * The two argument form is the one used here because the actor is already
   * asserted; the caller-only wrapper is for the policy bodies.
   */
  v_excluded := public.contest_excludes(p_contest_id, v_actor.id);

  if v_excluded then
    /*
     * Raised, not inserted-then-raised. A raise aborts the transaction and
     * would take any audit row with it, so the record of the attempt is written
     * by the Edge Function AFTER this returns, through
     * record_contest_exclusion_attempt (rule X4).
     *
     * One flat sentence that names no reason: Rashid decided on 2026-08-12 that
     * an excluded creator is never told they are barred.
     */
    raise exception 'you are not eligible for this contest' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.contest_entries e
    where e.contest_id = p_contest_id
      and e.creator_id = v_actor.id
      and e.status in ('pending', 'approved')
  ) then
    raise exception 'you have already entered this one' using errcode = '55006';
  end if;

  -- The fixed money only. Ranked and milestone rewards are contingent and
  -- commit at settlement, because at approval nobody knows who won.
  if not v_contest.needs_admin_approval then
    select coalesce(sum(d.reward_amount), 0), nullif(coalesce(sum(d.video_count), 0), 0)
    into v_amount, v_videos
    from public.contest_deliverables d
    where d.contest_id = p_contest_id and d.is_active and d.kind = 'fixed';
  end if;

  insert into public.contest_entries (
    contest_id, brand_id, creator_id, creator_handle, creator_name, creator_email,
    status, auto_approved, currency, committed_amount, committed_video_count, note,
    decided_at
  )
  values (
    p_contest_id, v_contest.brand_id, v_actor.id, v_handle, v_actor.display_name,
    v_actor.email,
    /*
     * Cast on both arms, and it is not decoration. A CASE whose arms are two
     * bare literals resolves to TEXT, and text into an enum column is an
     * EXPLICIT cast rather than an assignment one, so without these the whole
     * migration fails to apply with "column status is of type
     * contest_entry_status but expression is of type text".
     */
    case
      when v_contest.needs_admin_approval then 'pending'::public.contest_entry_status
      else 'approved'::public.contest_entry_status
    end,
    not v_contest.needs_admin_approval,
    v_contest.currency, v_amount, v_videos, v_note,
    case when v_contest.needs_admin_approval then null else now() end
  )
  returning * into v_row;

  if not v_contest.needs_admin_approval then
    insert into public.contest_entry_terms (
      entry_id, deliverable_id, kind, title, detail, video_count, rank_position,
      metric, threshold, reward_amount, currency
    )
    select v_row.id, d.id, d.kind, d.title, d.detail, d.video_count, d.rank_position,
           d.metric, d.threshold, d.reward_amount, v_contest.currency
    from public.contest_deliverables d
    where d.contest_id = p_contest_id and d.is_active;
  end if;

  insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
  values (
    v_row.id, v_actor.id,
    case when v_contest.needs_admin_approval then 'entered' else 'accepted' end,
    null, v_actor.id
  );

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role,
    case when v_contest.needs_admin_approval
      then 'contest_entry.created' else 'contest_entry.approved' end,
    'contest_entry', v_row.id, v_actor.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'contest', v_contest.name,
      'contest_id', v_contest.id,
      'creator', v_row.creator_handle,
      'automatic', not v_contest.needs_admin_approval,
      'committed_amount', v_row.committed_amount,
      'committed_video_count', v_row.committed_video_count,
      'currency', v_row.currency
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 14. withdraw_contest_entry
-- ============================================================================
/*
 * THE CREATOR'S OWN ACT AND NOBODY ELSE'S, and this is the only way a live
 * entry ever leaves the live set.
 *
 * READ THAT NEXT TO WHAT IS NOT IN THIS FILE. There is no remove_contest_entry,
 * no soft remove, no disqualify flag, no `excluded` entry status and no admin
 * side withdraw, and there never may be one (Q7, rule X9). This function is a
 * creator changing their own mind, which is a different act with a different
 * actor, and its existence is not an argument that the other one is missing.
 *
 * Always allowed from pending. From approved, allowed only while they have
 * filed nothing and been awarded nothing: past that the entry stands, for the
 * creator as well as for staff, and the outcome is decided by review and by
 * settlement rather than by taking the row away. withdraw_offer_application
 * refuses anything not pending, which is right for offers because approval is
 * always an admin act; auto approve breaks that assumption, because a creator
 * who taps Apply is instantly in.
 */

create or replace function public.withdraw_contest_entry(
  p_actor_id uuid,
  p_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_row     public.contest_entries%rowtype;
  v_contest public.contests%rowtype;
  v_was     public.contest_entry_status;
  v_filed   integer;
  v_awarded integer;
begin
  v_actor := public.assert_active_creator(p_actor_id);

  -- Locked on id AND creator_id together. A creator who knows another entry's
  -- id gets "no such entry", never a permission error that confirms the row
  -- exists.
  select * into v_row
  from public.contest_entries
  where id = p_entry_id and creator_id = v_actor.id
  for update;

  if not found then
    raise exception 'no such entry' using errcode = 'P0002';
  end if;

  if v_row.status not in ('pending', 'approved') then
    raise exception 'that entry is already %', v_row.status using errcode = '55006';
  end if;

  -- What it was before, so the log says whether somebody pulled out of a queue
  -- or out of a contest they were already in. The two are different acts.
  v_was := v_row.status;

  select * into v_contest from public.contests where id = v_row.contest_id;
  if v_contest.settled_at is not null then
    raise exception 'that contest has been settled' using errcode = '22023';
  end if;

  if v_row.status = 'approved' then
    select count(*) into v_filed
    from public.contest_submissions s where s.entry_id = p_entry_id;

    select count(*) into v_awarded
    from public.contest_awards w where w.entry_id = p_entry_id;

    if v_filed > 0 or v_awarded > 0 then
      raise exception
        'you have already filed work on this one, so the entry stands, talk to us if you need to stop'
        using errcode = '55006';
    end if;
  end if;

  update public.contest_entries
  set status = 'withdrawn'
  where id = p_entry_id
  returning * into v_row;

  insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
  values (v_row.id, v_actor.id, 'withdrawn', null, v_actor.id);

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest_entry.withdrawn',
    'contest_entry', v_row.id, v_actor.id,
    jsonb_strip_nulls(jsonb_build_object(
      'contest', v_contest.name,
      'contest_id', v_row.contest_id,
      'brand_id', v_row.brand_id,
      'creator', v_row.creator_handle,
      'was', v_was::text
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 15. review_contest_entry
-- ============================================================================
/*
 * The admin's decision, and the second of the two that carry the weight.
 *
 * The entry AND the contest are both locked, so two admins cannot both decide
 * the same entry, and a second decision on one entry is refused even if they
 * click in the same instant: the status guard is read under the lock the first
 * transaction is holding.
 *
 * The terms are read ONCE, here, and kept. The contest may be edited afterwards
 * and this must not move (rule F1).
 */

create or replace function public.review_contest_entry(
  p_actor_id uuid,
  p_entry_id uuid,
  p_decision public.contest_entry_status,
  p_note text default null,
  -- Rejecting under a partial unique index is an invitation to re-enter within
  -- seconds. This is the switch that makes it stop, in the same transaction.
  p_block boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_row     public.contest_entries%rowtype;
  v_contest public.contests%rowtype;
  v_brand   public.brands%rowtype;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
  v_amount  numeric := null;
  v_videos  integer := null;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if p_decision not in ('approved', 'rejected') then
    raise exception 'a decision is approved or rejected' using errcode = '22023';
  end if;

  select * into v_row from public.contest_entries where id = p_entry_id for update;
  if not found then
    raise exception 'no such entry' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'that was already %', v_row.status using errcode = '55006';
  end if;

  select * into v_contest from public.contests where id = v_row.contest_id for update;
  if v_contest.settled_at is not null then
    raise exception 'that contest has been settled' using errcode = '22023';
  end if;
  if v_contest.cancelled_at is not null then
    raise exception 'that contest was cancelled' using errcode = '22023';
  end if;

  if p_decision = 'approved' then
    -- Read the terms ONCE, here, and keep them. The frozen rows are the
    -- promise; the contest may be edited afterwards and this must not move.
    select coalesce(sum(d.reward_amount), 0), nullif(coalesce(sum(d.video_count), 0), 0)
    into v_amount, v_videos
    from public.contest_deliverables d
    where d.contest_id = v_row.contest_id and d.is_active and d.kind = 'fixed';
  end if;

  update public.contest_entries
  set status                = p_decision,
      decided_by            = v_actor.id,
      decided_at            = now(),
      decision_note         = v_note,
      committed_amount      = v_amount,
      committed_video_count = v_videos,
      currency              = v_contest.currency
  where id = p_entry_id
  returning * into v_row;

  if p_decision = 'approved' then
    insert into public.contest_entry_terms (
      entry_id, deliverable_id, kind, title, detail, video_count, rank_position,
      metric, threshold, reward_amount, currency
    )
    select v_row.id, d.id, d.kind, d.title, d.detail, d.video_count, d.rank_position,
           d.metric, d.threshold, d.reward_amount, v_contest.currency
    from public.contest_deliverables d
    where d.contest_id = v_row.contest_id and d.is_active;
  end if;

  /*
   * The block flag writes the exclusion in the same transaction as the
   * rejection, and both creator select policies on `contests` read it back
   * through contest_excludes_caller, so the contest goes dark for that person
   * rather than keeping a lit Apply button they would be refused at.
   *
   * The cost is real and was accepted: a rejected AND blocked creator loses the
   * contest's name and the brand's name on their own history. Their
   * contest_entry_events row survives; the contest behind it goes dark. A
   * rejected creator who is NOT blocked loses nothing and may enter again,
   * which is what the partial index is for.
   */
  if p_decision = 'rejected' and p_block then
    insert into public.contest_exclusions (contest_id, user_id, handle, email, reason, created_by)
    values (v_row.contest_id, v_row.creator_id, v_row.creator_handle,
            v_row.creator_email, v_note, v_actor.id)
    on conflict (contest_id, user_id) where user_id is not null do nothing;
  end if;

  insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
  values (v_row.id, v_row.creator_id, p_decision::text, v_note, v_actor.id);

  select * into v_brand from public.brands where id = v_row.brand_id;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role,
    'contest_entry.' || p_decision::text, 'contest_entry', v_row.id, v_row.creator_id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'contest', v_contest.name,
      'contest_id', v_contest.id,
      'brand_id', v_row.brand_id,
      'creator', v_row.creator_handle,
      'committed_amount', v_row.committed_amount,
      'committed_video_count', v_row.committed_video_count,
      'currency', v_row.currency,
      'blocked', p_block,
      'note', v_note
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 16. submit_contest_content
-- ============================================================================
/*
 * A creator filing work against their own contest entry.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK is the contest's status and its expiry
 * (rules L1, L8). Openness decides who may ENTER; it says nothing about whether
 * somebody already in may still deliver. An admin flipping a contest to
 * inactive to stop new entrants must not silently kill four creators mid
 * deliverable, and a deadline passing must not either: the entry is the promise
 * and the promise outlives the door closing. submit_content checks the job and
 * not the offer for exactly the same reason.
 *
 * What it DOES check is settlement and cancellation, because those are terminal
 * and a late video after prizes are announced would change an outcome somebody
 * has already been told (rule L9).
 */

create or replace function public.submit_contest_content(
  p_actor_id uuid,
  p_entry_id uuid,
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
  v_actor   public.profiles%rowtype;
  v_entry   public.contest_entries%rowtype;
  v_contest public.contests%rowtype;
  v_row     public.contest_submissions%rowtype;
begin
  v_actor := public.assert_active_creator(p_actor_id);

  -- Matched on creator_id as well as the id, the same rule
  -- withdraw_contest_entry and submit_content follow. Without it a creator who
  -- knows somebody else's entry id could file videos onto their work.
  select * into v_entry
  from public.contest_entries
  where id = p_entry_id and creator_id = v_actor.id
  for update;

  if not found then
    raise exception 'that is not one of your contests' using errcode = '42501';
  end if;
  if v_entry.status <> 'approved' then
    raise exception 'you can only post work on a contest you are in' using errcode = '22023';
  end if;

  select * into v_contest from public.contests where id = v_entry.contest_id;
  if v_contest.settled_at is not null then
    raise exception 'that contest has been settled' using errcode = '22023';
  end if;
  if v_contest.cancelled_at is not null then
    raise exception 'that contest was cancelled' using errcode = '22023';
  end if;

  insert into public.contest_submissions (
    entry_id, contest_id, creator_id, brand_id, creator_handle, creator_name,
    video_url, ad_code, ad_authorized,
    thumbnail_url, video_title, video_author, embed_id
  )
  values (
    v_entry.id, v_entry.contest_id, v_actor.id, v_entry.brand_id,
    v_entry.creator_handle, v_entry.creator_name,
    trim(p_video_url), trim(p_ad_code), coalesce(p_ad_authorized, false),
    p_thumbnail_url, p_video_title, p_video_author, p_embed_id
  )
  returning * into v_row;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest_content.submitted',
    'contest_submission', v_row.id, v_actor.id,
    jsonb_strip_nulls(jsonb_build_object(
      'contest', v_contest.name,
      'contest_id', v_contest.id,
      'brand_id', v_row.brand_id,
      'creator', v_row.creator_handle,
      'ad_code', v_row.ad_code
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 17. review_contest_content
-- ============================================================================
/*
 * The team watching a video filed against a contest and deciding.
 *
 * There is no stage machine here and no job to finish, which is the whole
 * difference from review_content: a contest entry's completeness is derived by
 * contest_entry_progress from the count that froze at approval, so nothing
 * needs to be written to say a contest deliverable is done.
 *
 * REJECTING WORK IS ALSO THE FIRST OF THE THREE LEVERS that remain for a bad
 * actor mid contest, since there is no removal (3.4.1): refuse the work and the
 * deliverables never complete, so the fixed money is never earned.
 *
 * A decision is still allowed on a settled contest, deliberately. A submission
 * left undecided when the contest closed still deserves an answer, and refusing
 * to review it would strand the creator under a status nobody can move.
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
  v_actor   public.profiles%rowtype;
  v_row     public.contest_submissions%rowtype;
  v_contest public.contests%rowtype;
  v_brand   public.brands%rowtype;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
  v_was     public.content_status;
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

  -- What it was BEFORE we touched it, so the log can show an approval being
  -- taken back rather than only where it landed.
  v_was := v_row.status;

  update public.contest_submissions
  set status = p_status,
      decision_note = v_note,
      decided_by = v_actor.id,
      decided_at = now()
  where id = p_content_id
  returning * into v_row;

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
      'note', v_note
    ))
  );

  return jsonb_build_object('submission', to_jsonb(v_row));
end;
$$;

-- ============================================================================
-- 18. set_contest_entry_target, the one function that writes no audit row
-- ============================================================================

create or replace function public.set_contest_entry_target(
  p_actor_id uuid,
  p_entry_id uuid,
  -- NULL clears the target. There is no separate clear function: "I am not
  -- going for a number any more" is the same act as changing it.
  p_target integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_entry   public.contest_entries%rowtype;
  v_contest public.contests%rowtype;
  v_row     public.contest_entry_targets%rowtype;
begin
  -- role = 'creator' exactly, the same gate as entering. Staff have no business
  -- here even as themselves, and there is no p_creator_id to pass.
  v_actor := public.assert_active_creator(p_actor_id);

  -- Locked on id AND creator_id together, the withdraw_contest_entry shape. A
  -- creator who knows another entry's id gets "no such entry", never a
  -- permission error that confirms the row exists.
  select * into v_entry from public.contest_entries
  where id = p_entry_id and creator_id = v_actor.id for update;
  if not found then
    raise exception 'no such entry' using errcode = 'P0002';
  end if;

  -- A target only means something on a live entry. Pending has nothing to count
  -- yet, and the rest are over.
  if v_entry.status <> 'approved' then
    raise exception 'you can set a target once you are in' using errcode = '55006';
  end if;

  select * into v_contest from public.contests where id = v_entry.contest_id;
  if v_contest.settled_at is not null or v_contest.cancelled_at is not null then
    raise exception 'that contest is over' using errcode = '22023';
  end if;

  if p_target is null then
    delete from public.contest_entry_targets where entry_id = p_entry_id;
    return 'null'::jsonb;
  end if;

  insert into public.contest_entry_targets (entry_id, creator_id, target)
  values (p_entry_id, v_actor.id, p_target)
  on conflict (entry_id) do update
    set target = excluded.target, updated_at = now()
  returning * into v_row;

  /*
   * NO audit_log ROW, AND NO contest_entry_events ROW. Both deliberate, both
   * the same reason: audit_log carries an is_staff() read policy and
   * contest_entry_events carries contest_entry_events_select_staff, so writing
   * the target into either would hand staff, in a searchable table, the exact
   * number contest_entry_targets refuses them through the policies. It would
   * also outlive the creator clearing it, so a withdrawn target could still be
   * read.
   *
   * This is the only write in the whole feature with no trail, and the trade is
   * real: if a creator says their target vanished, there is nothing to look at.
   * It is worth paying. A private number is either private or it is not, and a
   * trail somebody else can read is not.
   *
   * What it costs is the trail on ONE field. It does not cost the entry's
   * trail: approval, money, submission, withdrawal and settlement are audited
   * exactly as before and the target touches none of them. Nothing is owed
   * because of it and no reward moves. It is a note the creator wrote to
   * themselves inside our product.
   */

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 19. delete_product learns about contests
-- ============================================================================
/*
 * Not a new function: the one from
 * 20260730170000_brand_about_products_and_creator_access.sql, replaced, with
 * one guard added.
 *
 * contest_products references brand_products with `on delete restrict`, so a
 * product attached to a live contest already cannot be deleted, even by a
 * direct service key write, which is more than delete_offer's function-only
 * protection manages. What that guarantee does NOT give anybody is a sentence:
 * without this the admin gets a foreign key violation naming a constraint they
 * have never heard of. The FK is the boundary; this is the reason.
 *
 * The argument list is unchanged, so no `drop function` is needed and the
 * existing grants survive `create or replace`. They are restated at the foot of
 * this file anyway, because a grant somebody has to remember is a grant that
 * gets forgotten.
 */

create or replace function public.delete_product(p_actor_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_product  public.brand_products%rowtype;
  v_brand    public.brands%rowtype;
  v_contests integer;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_product from public.brand_products where id = p_product_id;
  if not found then
    raise exception 'no such product' using errcode = 'P0002';
  end if;

  select count(*) into v_contests
  from public.contest_products cp
  where cp.product_id = p_product_id;

  if v_contests > 0 then
    raise exception
      'this product is part of % contest(s), take it off those first', v_contests
      using errcode = '23503';
  end if;

  select * into v_brand from public.brands where id = v_product.brand_id;

  -- Audit row first, in the same transaction, so the record of what was removed
  -- survives the removal.
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'product.deleted', 'product', v_product.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_product.brand_id,
      'name', v_product.name,
      'external_product_id', v_product.external_product_id,
      'price', v_product.price,
      'currency', v_product.currency
    ))
  );

  delete from public.brand_products where id = p_product_id;

  return to_jsonb(v_product);
end;
$$;

-- ============================================================================
-- 20. The locks, every function, both lines
-- ============================================================================
/*
 * Server side only. A user token cannot reach any of these even by name, which
 * is the whole point of putting every contest write behind an Edge Function
 * that re-checks the caller first.
 *
 * MISSING THE SECOND LINE OF A PAIR IS NOT A STYLE SLIP. It is the entire
 * reason 20260811173000_grant_content_functions.sql exists: four content
 * functions shipped returning "permission denied for function" because the
 * revoke was written and the grant was not.
 *
 * The three shared definitions from the schema migration deliberately do NOT
 * follow this pattern and must not be made to. contest_is_open and
 * contest_excludes_caller are granted to `authenticated` on purpose, because
 * they are evaluated inside RLS policy bodies with the caller's own rights and
 * a policy calling a function the caller cannot execute fails the whole read.
 * contest_excludes, which takes a uuid and can therefore ask about anybody,
 * already follows this pattern exactly.
 */

revoke all on function public.save_contest(
  uuid, uuid, text, timestamptz, text, uuid, text, text, text, text, timestamptz,
  text, public.contest_status, boolean
) from public, anon, authenticated;
grant execute on function public.save_contest(
  uuid, uuid, text, timestamptz, text, uuid, text, text, text, text, timestamptz,
  text, public.contest_status, boolean
) to service_role;

revoke all on function public.set_contest_status(uuid, uuid, public.contest_status)
  from public, anon, authenticated;
grant execute on function public.set_contest_status(uuid, uuid, public.contest_status)
  to service_role;

revoke all on function public.settle_contest(uuid, uuid, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.settle_contest(uuid, uuid, jsonb, text, boolean)
  to service_role;

revoke all on function public.cancel_contest(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_contest(uuid, uuid, text) to service_role;

revoke all on function public.delete_contest(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_contest(uuid, uuid) to service_role;

revoke all on function public.save_contest_deliverable(
  uuid, uuid, public.contest_deliverable_kind, text, uuid, text, integer, integer,
  text, numeric, numeric, integer, boolean
) from public, anon, authenticated;
grant execute on function public.save_contest_deliverable(
  uuid, uuid, public.contest_deliverable_kind, text, uuid, text, integer, integer,
  text, numeric, numeric, integer, boolean
) to service_role;

revoke all on function public.retire_contest_deliverable(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.retire_contest_deliverable(uuid, uuid) to service_role;

revoke all on function public.set_contest_products(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.set_contest_products(uuid, uuid, uuid[]) to service_role;

revoke all on function public.save_contest_commercials(uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.save_contest_commercials(uuid, uuid, numeric, text)
  to service_role;

revoke all on function public.save_contest_exclusion(uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_contest_exclusion(uuid, uuid, text, text, uuid, text)
  to service_role;

revoke all on function public.remove_contest_exclusion(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_contest_exclusion(uuid, uuid) to service_role;

revoke all on function public.record_contest_exclusion_attempt(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_contest_exclusion_attempt(uuid, uuid)
  to service_role;

revoke all on function public.apply_for_contest(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_for_contest(uuid, uuid, text) to service_role;

revoke all on function public.withdraw_contest_entry(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.withdraw_contest_entry(uuid, uuid) to service_role;

revoke all on function public.review_contest_entry(
  uuid, uuid, public.contest_entry_status, text, boolean
) from public, anon, authenticated;
grant execute on function public.review_contest_entry(
  uuid, uuid, public.contest_entry_status, text, boolean
) to service_role;

revoke all on function public.submit_contest_content(
  uuid, uuid, text, text, boolean, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.submit_contest_content(
  uuid, uuid, text, text, boolean, text, text, text, text
) to service_role;

revoke all on function public.review_contest_content(
  uuid, uuid, public.content_status, text
) from public, anon, authenticated;
grant execute on function public.review_contest_content(
  uuid, uuid, public.content_status, text
) to service_role;

revoke all on function public.set_contest_entry_target(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.set_contest_entry_target(uuid, uuid, integer)
  to service_role;

-- Replaced above rather than created, so its privileges survived. Restated so
-- the pair is visible next to the function that now carries a new refusal.
revoke all on function public.delete_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_product(uuid, uuid) to service_role;
