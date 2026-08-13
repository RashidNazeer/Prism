/*
 * Contests, the corrections
 * ============================================================================
 *
 * 20260813151702_contests_schema.sql and 20260813151705_contests_functions.sql
 * are both APPLIED on dev, so neither may be edited. Everything below is the
 * part of the contest review that could not be fixed in TypeScript.
 *
 * WHAT IS IN HERE AND WHY, in the order it appears:
 *
 *  1. THE M7 CEILING ONLY EVER COUNTED FIXED REWARDS. All three doors filtered
 *     `d.kind = 'fixed'`, so a GBP 2,000 pot took 1st 1,500, 2nd 1,000 and 3rd
 *     500 without a word, and lowering the budget afterwards succeeded too
 *     because it was comparing GBP 0 against the new figure. The functions were
 *     not wrong about rule M7: RULE M7 IS WRONG, because it is written as "the
 *     sum of active fixed deliverable rewards" while its own justification, "a
 *     single prize arithmetically larger than the whole pot on the day it is
 *     typed is a typo", is about the ranked case its mechanism excludes.
 *     docs/CONTESTS_PLAN.md HAS TO BE CORRECTED IN THE SAME COMMIT AS THIS FILE
 *     or the plan and the database now disagree.
 *
 *     Note what has NOT changed: a fixed reward is still counted once rather
 *     than once per entrant. Rule M7 rules that out in its own text and it is a
 *     deliberate call, not an omission.
 *
 *  2. SETTLEMENT CHECKED NO BUDGET AT ALL, which is where a ranked overspend
 *     actually lands, and it would happily award a FIXED term that already
 *     committed when the entry was approved. `review_contest_entry` copies
 *     every active deliverable onto `contest_entry_terms` and freezes the fixed
 *     money into `committed_amount`, so ticking that row again at settlement
 *     wrote a second `contest_awards` row for money `contest_totals.committed`
 *     already counts. Rule M8 says ranked and milestone commit at settlement;
 *     nothing enforced it.
 *
 *  3. A SETTLED OR CANCELLED CONTEST COULD STILL BE REWRITTEN. `save_contest`
 *     guarded only the deadline against terminal state, so a name, a judging
 *     sentence and even `status = 'active'` fell straight through, and
 *     `save_contest_commercials` took the row for update and checked nothing at
 *     all. Entrants read the judging sentence on their own award screen, so an
 *     edit after settlement changes the stated basis people were paid on.
 *
 *  4. ONE ADMIN NOTE WAS WRITTEN INTO THREE PLACES, one of them staff only.
 *     `review_contest_entry` put `p_note` into `contest_entries.decision_note`,
 *     into `contest_entry_events.note` AND, under the block flag, into
 *     `contest_exclusions.reason`. The first two are selectable by the creator
 *     they are about; the schema asserts at 20260813151702:240-243 that the
 *     exclusion reason is staff only and unreadable outside the team. The row
 *     is staff only. The sentence in it was not, because it existed three
 *     times. Split into two arguments, and the old five argument form is
 *     dropped so a stale deployment cannot bind to it.
 *
 *  5. AN UNRESOLVED EXCLUSION WAS DEFEATED BY CHANGING EMAIL ADDRESS.
 *     `save_contest_exclusion` pins a `user_id` at save time, which is exactly
 *     the moment there is usually no account to pin to, and `contest_excludes`
 *     then compares the exclusion's email against `profiles.email` live on
 *     every read. Any authenticated user can call `auth.updateUser({ email })`.
 *     So the pin now also happens from the other end, the moment the account
 *     appears or its email changes, folding duplicates exactly the way
 *     `save_contest_exclusion` already does.
 *
 *  6. DELETED `contest_entries` ROWS WERE BROADCAST IN FULL. Row security is
 *     not applied to DELETE events, which is the reason this feature's own
 *     schema comment gives for keeping `contest_commercials` and
 *     `contest_exclusions` out of the publication. The same reasoning was not
 *     applied to `contest_entries`, which carries creator_email, creator_name,
 *     creator_handle, committed_amount and decision_note, and `delete_contest`
 *     cascades those rows away.
 *
 *  7. `contest_excludes_caller` WAS A PUBLIC RPC. It is granted to
 *     `authenticated` because it is evaluated inside two RLS policy bodies with
 *     the caller's own rights, and PostgREST exposes everything in `public`, so
 *     POST /rest/v1/rpc/contest_excludes_caller answered "are you barred from
 *     this contest" to any signed in creator. Decision D3 says that is the one
 *     question a creator is never told, and `apply_for_contest`'s deliberately
 *     vague refusal was undone by one call. Moved out of `public`.
 *
 *     `contest_is_open` STAYS in public and the pair is deliberately split.
 *     `apply_for_contest` calls it from a plpgsql body, and a plpgsql body is
 *     stored as text and re-parsed at execution, so moving it would break that
 *     function at run time rather than at migration time. It also leaks
 *     nothing: whether a contest is taking entries is not a fact about a
 *     person.
 *
 * NOT IN HERE, on purpose:
 *   - `contest_awards.note` is creator readable and its name does not say so.
 *     Real, but nothing has published anything: the settlement screen does not
 *     exist. Renaming a column for no behaviour change is not worth a
 *     migration. It goes in the plan and in FEATURE_MAP so the settle screen
 *     labels that box as something the entrant reads.
 *   - A creator withdrawing mid settlement aborts the whole settle with an
 *     unactionable message. The money outcome is correct, the transaction rolls
 *     back, and one sentence is not worth its own migration.
 *
 * HOW TO READ THE REPLACED FUNCTIONS. Every one of them keeps its full
 * explanation in 20260813151705_contests_functions.sql, which is where anybody
 * asking "why does this work like this" should still be sent. Only what CHANGED
 * is explained here; the rest of each body is the applied text word for word, so
 * a diff between the two files is exactly the list above and nothing else.
 *
 * NOT APPLIED. Read it, then `supabase db push`.
 */

-- ============================================================================
-- 0. The one definition of "does this contest fit inside its budget"
-- ============================================================================
/*
 * Rule M7, widened, in ONE place because it is quoted from four doors and three
 * of them had already drifted into three copies of the same paragraph.
 *
 * It sums every ACTIVE reward row rather than the fixed ones only. A placing
 * and a milestone are money the contest is offering exactly as a fixed reward
 * is, and "a single prize arithmetically larger than the whole pot" is the
 * ranked case far more often than the fixed one.
 *
 * The message quotes BOTH HALVES, because "the rewards add up to 3,000" on a
 * contest whose fixed rows total 200 is a sentence an admin cannot act on.
 *
 * It takes the budget as an argument rather than reading it, so
 * save_contest_commercials can ask the question about the figure being typed
 * rather than about the one already stored. A null budget is no ceiling, and
 * that is a real answer rather than a missing one.
 *
 * NOT marked stable, deliberately. Every caller holds a lock and has usually
 * just written the row it is asking about.
 */
create or replace function public.assert_contest_within_budget(
  p_contest_id uuid,
  p_currency text,
  p_budget numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fixed  numeric;
  v_placed numeric;
begin
  if p_budget is null then
    return;
  end if;

  select coalesce(sum(d.reward_amount) filter (where d.kind = 'fixed'), 0),
         coalesce(sum(d.reward_amount) filter (where d.kind in ('rank', 'milestone')), 0)
  into v_fixed, v_placed
  from public.contest_deliverables d
  where d.contest_id = p_contest_id and d.is_active;

  if v_fixed + v_placed > p_budget then
    raise exception
      'the rewards on this contest add up to % % (% % anybody who delivers can earn, % % in placings and milestones), which is more than the % % budget',
      v_fixed + v_placed, p_currency, v_fixed, p_currency, v_placed, p_currency,
      p_budget, p_currency
      using errcode = '22023';
  end if;
end;
$$;

comment on function public.assert_contest_within_budget(uuid, text, numeric) is
  'Rule M7. Refuses when the ACTIVE reward rows on a contest, fixed and ranked and milestone together, add up to more than the budget it carries. Quoted by save_contest, save_contest_deliverable, save_contest_commercials and settle_contest so no two of them can answer differently.';


-- ============================================================================
-- 1. save_contest
-- ============================================================================
/*
 * Replaced for two reasons, both above: the M7 sum now counts every reward row
 * through assert_contest_within_budget, and TERMINAL MEANS TERMINAL FOR THE
 * WHOLE ROW rather than for the deadline alone. Everything else is the applied
 * text, unchanged.
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

    /*
     * TERMINAL MEANS TERMINAL FOR THE WHOLE ROW, and this is the check that was
     * missing. Only the deadline was guarded, so the name, the description, the
     * judging sentence and even `status` fell straight through on a settled or
     * cancelled contest, and status could be flipped back to active on a contest
     * that had already paid out. Entrants read the judging sentence on their own
     * award screen through contests_select_own_entries, so an edit after
     * settlement changes the stated basis people were paid on, with nothing but
     * an audit row to show for it. Every other write function in this feature
     * already carries this pair.
     */
    if v_before.settled_at is not null then
      raise exception 'that contest has been settled, so it cannot be edited any more'
        using errcode = '22023';
    end if;
    if v_before.cancelled_at is not null then
      raise exception 'that contest was cancelled, so it cannot be edited any more'
        using errcode = '22023';
    end if;

    v_opens := coalesce(p_opens_at, v_before.opens_at);

    if p_expires_at <= v_opens then
      raise exception 'a contest has to close after it opens' using errcode = '22023';
    end if;

    -- The deadline's own terminal check used to live here (rules L9, L10). It
    -- is covered by the row-wide pair above and would now be unreachable.

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
    -- Through the shared guard now, which counts placings and milestones too.
    select c.total_budget into v_budget
    from public.contest_commercials c
    where c.contest_id = p_contest_id;

    perform public.assert_contest_within_budget(p_contest_id, v_currency, v_budget);

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
-- 2. save_contest_deliverable
-- ============================================================================
/*
 * Replaced for the M7 sum alone. Everything else is the applied text.
 *
 * This is the one worth landing FIRST, before the reward row form is built on
 * top of it: the form is the screen that makes ranked and milestone rows
 * reachable at all, and it would otherwise be built against a ceiling that does
 * not hold for two of the three kinds it offers.
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
   *
   * THAT SENTENCE IS ABOUT A PLACING at least as often as about a fixed reward,
   * and the check it justified excluded placings, so it never fired on the case
   * it was written for. The shared guard counts all three kinds.
   */
  select c.total_budget into v_budget
  from public.contest_commercials c
  where c.contest_id = p_contest_id;

  perform public.assert_contest_within_budget(p_contest_id, v_contest.currency, v_budget);

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
-- 3. save_contest_commercials
-- ============================================================================
/*
 * Replaced for the M7 sum, and for the terminal state check it never had at
 * all. It took the contest row FOR UPDATE and then asked it nothing.
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
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'no such contest' using errcode = 'P0002';
  end if;

  -- It took the row FOR UPDATE and then asked it nothing. Every other write
  -- function in this feature carries this pair, and a budget rewritten after
  -- settlement changes what the audit trail says the contest was working to.
  if v_contest.settled_at is not null then
    raise exception 'that contest has been settled, so its budget cannot change'
      using errcode = '22023';
  end if;
  if v_contest.cancelled_at is not null then
    raise exception 'that contest was cancelled, so its budget cannot change'
      using errcode = '22023';
  end if;

  -- THE THIRD DOOR INTO M7, asked about the figure being typed rather than the
  -- one already stored, so lowering the budget under the rewards already
  -- promised is refused from this side too. A null budget is no ceiling and the
  -- guard returns without comment.
  perform public.assert_contest_within_budget(p_contest_id, v_contest.currency, p_total_budget);

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
-- 4. settle_contest
-- ============================================================================
/*
 * Replaced for the two money holes in it.
 *
 * A FIXED TERM IS REFUSED HERE. The term loop only checked that the amount was
 * above zero, and review_contest_entry has already frozen every active
 * deliverable onto contest_entry_terms and committed the fixed money into
 * contest_entries.committed_amount. So a settle screen listing what an entrant
 * was promised showed the fixed row beside the ranked ones, and ticking it
 * wrote a second contest_awards row for money contest_totals.committed already
 * counts. Rule M8 says ranked and milestone commit here; now it is enforced.
 *
 * AND THE BUDGET IS CHECKED, once, against the total actually being written.
 * Rule M7 guarded the reward rows and never guarded the event where the money
 * is really spent, which is precisely where a ranked overspend lands.
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
  v_budget    numeric;
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

      /*
       * M8, ENFORCED RATHER THAN ASSUMED. A fixed reward committed when the
       * entry was approved: review_contest_entry froze every active deliverable
       * onto contest_entry_terms and put the fixed money into
       * contest_entries.committed_amount. Awarding it again here writes a second
       * contest_awards row for money contest_totals.committed already counts,
       * and a settle screen listing everything an entrant was promised offers
       * exactly that row beside the ranked ones.
       */
      if v_term.kind = 'fixed' then
        raise exception
          '"%" is a fixed reward, so it was committed when that entry was approved and is not awarded again here',
          v_term.title
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

  /*
   * M7 AT THE EVENT WHERE THE MONEY IS ACTUALLY SPENT. The rule guarded the
   * reward rows against contest_commercials.total_budget from three doors and
   * guarded settlement from none, which is exactly where a ranked overspend
   * lands: the placings are only decided here.
   *
   * Compared against what is being written rather than against the reward rows,
   * because those are an offer and this is the bill. Nothing is retired, nobody
   * is unpaid: the whole transaction rolls back and the admin either raises the
   * budget or awards fewer places.
   */
  select c.total_budget into v_budget
  from public.contest_commercials c
  where c.contest_id = p_contest_id;

  if v_budget is not null and v_total > v_budget then
    raise exception
      'settling this contest would award % %, which is more than the % % budget it carries',
      v_total, v_row.currency, v_budget, v_row.currency
      using errcode = '22023';
  end if;

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
-- 5. review_contest_entry
-- ============================================================================
/*
 * DROPPED AND RECREATED WITH A SIXTH ARGUMENT, rather than replaced, so that no
 * caller anywhere can still bind to the five argument form and quietly put a
 * creator-facing note into a staff-only column. The drop comes first because
 * two overloads whose extra argument has a default are ambiguous, not additive.
 *
 * p_note is READ BY THE CREATOR IT IS ABOUT, through
 * contest_entries_select_own and contest_entry_events_select_own, neither of
 * which restricts columns. p_block_reason is read by nobody outside the team.
 * They were one argument, written into all three places at once.
 *
 * The entries queue therefore cannot ship one note box beside a Block switch.
 * Two boxes, and the second one appears with the switch.
 */
drop function if exists public.review_contest_entry(
  uuid, uuid, public.contest_entry_status, text, boolean
);

create or replace function public.review_contest_entry(
  p_actor_id uuid,
  p_entry_id uuid,
  p_decision public.contest_entry_status,
  -- THE CREATOR THIS IS ABOUT READS THIS. It lands on contest_entries and on
  -- contest_entry_events, both of which they can select in full.
  p_note text default null,
  -- Rejecting under a partial unique index is an invitation to re-enter within
  -- seconds. This is the switch that makes it stop, in the same transaction.
  p_block boolean default false,
  -- AND NOBODY OUTSIDE THE TEAM READS THIS. It lands on contest_exclusions and
  -- nowhere else. It used to be p_note, which is how one sentence ended up in a
  -- staff only column and in two creator readable ones at the same time.
  p_block_reason text default null
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
  v_reason  text := nullif(trim(coalesce(p_block_reason, '')), '');
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
   *
   * THE REASON HERE IS p_block_reason AND NEVER p_note. contest_exclusions.reason
   * is staff only and unreadable outside the team, which the schema states at
   * 20260813151702:240-243 as the difference between this column and
   * contests.cancel_message. The row was staff only; the sentence in it was not,
   * because it also existed on the entry and on the entry's history, both of
   * which the creator can read in full.
   *
   * ON CONFLICT NAMES THE USER INDEX AND ONLY THE USER INDEX, and unlike
   * save_contest_exclusion this one needs no fold. There are three partial
   * unique indexes on this table, one per key, and an upsert can only name one:
   * the reason the other two cannot be hit from here is that this path always
   * has a resolved creator_id, and a pre-existing row keyed by that person's
   * handle or email alone would already have made contest_excludes true, so
   * apply_for_contest would have refused the entry and there would be no pending
   * row to reject. Anyone widening the exclusion screen has to re-derive that,
   * so it is written down rather than left as an accident.
   */
  if p_decision = 'rejected' and p_block then
    insert into public.contest_exclusions (contest_id, user_id, handle, email, reason, created_by)
    values (v_row.contest_id, v_row.creator_id, v_row.creator_handle,
            v_row.creator_email, v_reason, v_actor.id)
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
      'note', v_note,
      -- audit_log is staff only, so the two sentences can sit side by side here
      -- even though they may never sit side by side anywhere a creator reads.
      'block_reason', v_reason
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ============================================================================
-- 6. An exclusion pins itself the moment the person it names turns up
-- ============================================================================
/*
 * Rule X3 says the only durable key is a resolved user_id, and
 * save_contest_exclusion resolves one at save time. The trouble is that the
 * usual reason an admin types an email rather than picking an account is that
 * there IS no account yet, so the pin does not happen, and contest_excludes
 * then compares the exclusion's email against profiles.email live on every
 * read. Any authenticated user can call auth.updateUser({ email }),
 * on_auth_user_email_changed rewrites profiles.email, the comparison stops
 * matching, and the contest reappears with a working Apply button.
 *
 * So the pin also happens from the other end. The email leg is the live one.
 * The handle leg is much narrower than it looks, because applications.user_id
 * is UNIQUE and applications_update_own_while_pending only permits an edit
 * while the application is still pending, which is before that person can enter
 * anything, but it costs nothing to close and the trigger is the same code.
 *
 * THE FOLD IS THE PART THAT WOULD BREAK. contest_exclusions carries THREE
 * partial unique indexes, one per key, and an upsert can only name one of them,
 * which is why save_contest_exclusion has an elaborate fold of its own. The
 * same problem arrives here: an unresolved row keyed by handle and another
 * keyed by email can both resolve to one person on one contest, so they are
 * aggregated to one row per contest BEFORE the insert, or the upsert would fail
 * with "ON CONFLICT DO UPDATE command cannot affect row a second time".
 *
 * The attempts counter comes across rather than being reset. It is a fact about
 * the person, not about the key (rules X5, X10).
 */

create or replace function public.pin_contest_exclusions(
  p_user_id uuid,
  p_email text,
  p_handle text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  with matched as (
    select x.id
    from public.contest_exclusions x
    where x.user_id is null
      and (
        (p_email is not null and x.email is not null and lower(x.email) = lower(p_email))
        or (
          p_handle is not null and x.handle is not null
          and lower(ltrim(x.handle, '@')) = lower(ltrim(p_handle, '@'))
        )
      )
  ),
  folded as (
    delete from public.contest_exclusions y
    using matched m
    where y.id = m.id
    returning y.contest_id, y.handle, y.email, y.reason, y.created_by,
              y.attempts, y.last_attempt_at
  ),
  one_per_contest as (
    select f.contest_id,
           max(f.handle)          as handle,
           max(f.email)           as email,
           max(f.reason)          as reason,
           -- array_agg rather than max, because Postgres has no max(uuid).
           (array_agg(f.created_by))[1] as created_by,
           sum(f.attempts)        as attempts,
           max(f.last_attempt_at) as last_attempt_at
    from folded f
    group by f.contest_id
  )
  insert into public.contest_exclusions (
    contest_id, handle, email, user_id, reason, created_by, attempts, last_attempt_at
  )
  select o.contest_id, o.handle, o.email, p_user_id, o.reason, o.created_by,
         o.attempts, o.last_attempt_at
  from one_per_contest o
  on conflict (contest_id, user_id) where user_id is not null do update
    set handle          = coalesce(contest_exclusions.handle, excluded.handle),
        email           = coalesce(contest_exclusions.email, excluded.email),
        reason          = coalesce(contest_exclusions.reason, excluded.reason),
        attempts        = contest_exclusions.attempts + excluded.attempts,
        -- greatest ignores nulls, so a row that has never been tested keeps the
        -- other row's timestamp rather than blanking it.
        last_attempt_at = greatest(contest_exclusions.last_attempt_at, excluded.last_attempt_at);
end;
$$;

comment on function public.pin_contest_exclusions(uuid, text, text) is
  'Resolves every unresolved exclusion naming this person to their account id, folding duplicate keys together. Rule X3: the email and the handle are ways of finding somebody, the uuid is the only thing that holds.';

create or replace function public.pin_exclusions_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handle text;
begin
  select a.tiktok_handle into v_handle
  from public.applications a
  where a.user_id = new.id
  order by a.created_at desc
  limit 1;

  perform public.pin_contest_exclusions(new.id, new.email, v_handle);
  return null;
end;
$$;

create or replace function public.pin_exclusions_from_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pin_contest_exclusions(new.user_id, null, new.tiktok_handle);
  return null;
end;
$$;

drop trigger if exists pin_contest_exclusions_on_profile on public.profiles;
create trigger pin_contest_exclusions_on_profile
  after insert or update of email on public.profiles
  for each row execute function public.pin_exclusions_from_profile();

drop trigger if exists pin_contest_exclusions_on_application on public.applications;
create trigger pin_contest_exclusions_on_application
  after insert or update of tiktok_handle on public.applications
  for each row execute function public.pin_exclusions_from_application();


/*
 * And the resolve inside save_contest_exclusion is made DETERMINISTIC in the
 * same pass, because it is the same failure from the other end.
 *
 * It ORed the email match against the handle match with `limit 1` and no
 * ordering, so an admin who types a handle belonging to one person and an email
 * belonging to another pinned the exclusion to whichever row Postgres happened
 * to return first, barred the wrong creator, and folded the right one's
 * attempts counter into the wrong row on the way. The email is the stronger
 * key: it is checked against the account itself rather than against an
 * application somebody can edit, so it wins.
 *
 * ONLY THE RESOLVE CHANGED. Everything else is the applied text.
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
    -- DETERMINISTIC, and it was not. `limit 1` over an OR with no ordering
    -- means an admin who types a handle belonging to one person and an email
    -- belonging to another pins the exclusion to whichever row Postgres returns
    -- first, bars the wrong creator, and folds the right one's attempts counter
    -- into the wrong row. The email is checked against the account itself and
    -- the handle against an application the applicant can edit, so email wins.
    order by (v_email is not null and lower(p.email) = lower(v_email)) desc, p.id
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
-- 7. Realtime stops broadcasting rows nobody may read
-- ============================================================================
/*
 * postgres_changes DOES NOT APPLY ROW SECURITY TO DELETE EVENTS. That sentence
 * is already in this feature's own schema migration, at section 16, as the
 * reason contest_commercials, contest_exclusions and contest_entry_targets were
 * kept out of the publication. It was not applied to the tables that DID join
 * it.
 *
 * With `replica identity full`, a delete broadcasts the WHOLE OLD ROW.
 * contest_entries carries creator_email, creator_name, creator_handle,
 * committed_amount and decision_note, and delete_contest cascades those rows
 * away for any contest holding only rejected and withdrawn entries. A
 * subscription pinned to creator_id=eq.<uid> is safe, because the filter is
 * applied to the old record, but any authenticated client can open one WITHOUT
 * that filter by hand.
 *
 * With `replica identity default` a delete carries the primary key and nothing
 * else, which is all a client needs in order to drop a row it is holding. The
 * cost, stated because it is real: no `old_record` on updates either, so
 * nothing may be built that diffs an update on these two tables in the browser.
 * Nothing does today.
 *
 * contests goes with it. Its own comment in section 16 says it must never be
 * hard deleted while a creator is subscribed to the catalogue channel, and
 * delete_contest shipped the same day with a control now wired to it.
 */
alter table public.contest_entries replica identity default;
alter table public.contests        replica identity default;

-- ============================================================================
-- 8. contest_excludes_caller stops being a public RPC
-- ============================================================================
/*
 * Decision D3: a creator is never told they are barred. apply_for_contest is
 * carefully vague about it, both creator select policies on `contests` make the
 * contest go dark rather than refuse, and then this function answered the
 * question directly over PostgREST, because everything in `public` is an
 * endpoint and it has to be executable by `authenticated` to be usable inside a
 * policy body at all.
 *
 * A schema PostgREST does not expose is the only way to have both. The policies
 * follow the function by OID rather than by name, so they would keep working
 * untouched, but they are recreated anyway: a policy whose text says something
 * different from what it does is worse than the leak.
 *
 * `private` is this project's first schema outside `public`. Nothing is exposed
 * from it and nothing else goes in it without saying why. CHECK THE PROJECT'S
 * EXPOSED SCHEMAS after pushing this: it must list `public` and not `private`.
 */
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter function public.contest_excludes_caller(uuid) set schema private;

revoke all on function private.contest_excludes_caller(uuid) from public, anon;
grant execute on function private.contest_excludes_caller(uuid) to authenticated;

comment on function private.contest_excludes_caller(uuid) is
  'Whether the CALLER is barred from this contest. In `private` because decision D3 says a creator is never told, and anything in `public` is a PostgREST endpoint. Quoted by both creator select policies on contests. Takes no user argument on purpose.';

drop policy if exists "contests_select_creator" on public.contests;
create policy "contests_select_creator" on public.contests
  for select to authenticated
  using (
    (select public.is_approved_creator())
    and public.contest_is_open(id)
    and not private.contest_excludes_caller(id)
  );

drop policy if exists "contests_select_own_entries" on public.contests;
create policy "contests_select_own_entries" on public.contests
  for select to authenticated
  using (
    exists (
      select 1 from public.contest_entries e
      where e.contest_id = contests.id and e.creator_id = (select auth.uid())
    )
    and not private.contest_excludes_caller(id)
  );

-- ============================================================================
-- 9. Grants
-- ============================================================================
/*
 * Server side only, and MISSING THE SECOND LINE OF A PAIR IS NOT A STYLE SLIP:
 * 20260811173000_grant_content_functions.sql exists because four functions
 * shipped returning "permission denied for function" when a revoke was written
 * and a grant was not.
 *
 * The functions replaced above kept their existing privileges, because
 * `create or replace` does not reset them. review_contest_entry did NOT: it was
 * dropped and recreated under a new signature, so its pair is mandatory rather
 * than restated.
 */

revoke all on function public.assert_contest_within_budget(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.assert_contest_within_budget(uuid, text, numeric)
  to service_role;

revoke all on function public.review_contest_entry(
  uuid, uuid, public.contest_entry_status, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.review_contest_entry(
  uuid, uuid, public.contest_entry_status, text, boolean, text
) to service_role;

-- The two trigger functions are reached only by the triggers that own them,
-- which run as their definer, so nobody needs execute on them by name.
revoke all on function public.pin_contest_exclusions(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.pin_contest_exclusions(uuid, text, text) to service_role;

revoke all on function public.pin_exclusions_from_profile() from public, anon, authenticated;
revoke all on function public.pin_exclusions_from_application() from public, anon, authenticated;

-- Restated so each pair is visible beside the function that now carries a new
-- refusal, in the style the first migration already uses.
revoke all on function public.save_contest(
  uuid, uuid, text, timestamptz, text, uuid, text, text, text, text, timestamptz,
  text, public.contest_status, boolean
) from public, anon, authenticated;
grant execute on function public.save_contest(
  uuid, uuid, text, timestamptz, text, uuid, text, text, text, text, timestamptz,
  text, public.contest_status, boolean
) to service_role;

revoke all on function public.save_contest_deliverable(
  uuid, uuid, public.contest_deliverable_kind, text, uuid, text, integer, integer,
  text, numeric, numeric, integer, boolean
) from public, anon, authenticated;
grant execute on function public.save_contest_deliverable(
  uuid, uuid, public.contest_deliverable_kind, text, uuid, text, integer, integer,
  text, numeric, numeric, integer, boolean
) to service_role;

revoke all on function public.save_contest_commercials(uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.save_contest_commercials(uuid, uuid, numeric, text)
  to service_role;

revoke all on function public.settle_contest(uuid, uuid, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.settle_contest(uuid, uuid, jsonb, text, boolean)
  to service_role;
