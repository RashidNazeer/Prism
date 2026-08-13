/*
 * Contests, redesigned: deliverables with targets, and progress the creator
 * types in
 * ============================================================================
 *
 * Rashid redesigned this on 2026-08-13, after the first two contest migrations
 * were already applied to dev. THE DATABASE HOLDS ONE CONTEST AND NOTHING ELSE:
 * zero deliverables, zero entries, zero terms, zero submissions, zero awards. So
 * this file drops columns and a type outright rather than carrying a data
 * migration nobody would ever read again. That freedom expires the moment a
 * creator enters something, which is why it is spent now.
 *
 * WHAT A CONTEST IS NOW, in his words:
 *
 *   A contest is a LIST OF DELIVERABLES. "How it is judged" is gone, replaced by
 *   them. The admin picks a TYPE, types the TARGET the creator has to reach, and
 *   types the REWARD for reaching it. As many rows as he likes.
 *
 *   PLACINGS ARE DROPPED. No first, second and third. Anybody who reaches a
 *   target earns its reward, and several creators can earn the same one. There
 *   is nothing to come first IN any more, so the rank kind, rank_position,
 *   metric, threshold and the whole judging_basis requirement go with it.
 *
 *   PROGRESS IS TYPED BY THE CREATOR AND CONFIRMED BY STAFF. Real tracking comes
 *   later. Until then a creator says what they have ACHIEVED, cumulatively, and
 *   NOTHING COUNTS UNTIL STAFF CONFIRM IT. A creator typing their own GMV is a
 *   creator typing their own payslip, so a typed figure is recorded as CLAIMED
 *   and money is only ever owed against a CONFIRMED one.
 *
 * THE SECURITY LINE IN THIS FEATURE, stated once here because five objects below
 * exist to keep it: A CREATOR MAY WRITE THEIR OWN ACHIEVEMENT AND NOTHING ELSE.
 * Not a target, not a reward, not another entrant's figure, not their own
 * confirmation. The target and the reward live on contest_deliverables, which
 * has no insert, update or delete policy and never will, and the one function a
 * creator can reach through the Edge Function, submit_contest_progress, takes no
 * target argument and no reward argument at all. There is nothing to forget to
 * validate, because there is nothing to pass.
 *
 * AND ONE AMENDMENT TO A STANDING DECISION, made deliberately by Rashid tonight.
 * Decision D7 said no creator ever sees anything about another entrant, and rule
 * N1 said no creator reachable surface returns a count of entrants in any form.
 * my_contest_standing below returns an entrant COUNT and the caller's own RANK,
 * so that a creator can be told "2nd closest of 5 to the GMV target". D7 and N1
 * are amended to exactly that much and no further: no handle, no name, no
 * figure, no identifier of any other entrant, ever. The reasoning about what
 * repeated calls can teach somebody is written out in full above the function,
 * because that is the whole of what this amendment costs.
 *
 * NOT APPLIED. Read it, then `supabase db push`.
 */

-- ============================================================================
-- 1. The new vocabulary
-- ============================================================================

/*
 * TWO TYPES TODAY, AND MORE LATER, which is the requirement this shape is built
 * to rather than a hope.
 *
 *   gmv          Generate GMV. The target is an amount, for example 500.
 *   video_count  Post videos. The target is a whole number.
 *
 * Adding the third is ONE LINE and no table rewrite:
 *
 *   alter type public.contest_deliverable_type add value 'ad_spend';
 *
 * Two things to know before typing it. Postgres will run that inside a
 * migration's transaction, but the NEW VALUE CANNOT BE USED in the same
 * transaction that adds it, so a migration that adds a value and then seeds a
 * row with it needs two migrations. And a value can never be removed, which is
 * the reason this enum starts with two rather than with the six somebody can
 * imagine: an unwritable value is a promise an admin screen eventually tries to
 * keep.
 *
 * Still an enum rather than text with a check, for the reason the first contests
 * migration gave for refusing jsonb: the type decides how the target is read,
 * how it is rendered, and which half of a progress update it is compared
 * against, so a typo in it has to fail at the write rather than render as a row
 * nothing matches.
 */
create type public.contest_deliverable_type as enum ('gmv', 'video_count');

comment on type public.contest_deliverable_type is
  'What a contest deliverable asks for. Extended with one alter type ... add value, never with a second column.';

/*
 * A claimed figure, and what staff did about it. `pending` is what a creator
 * writes; only staff can move it, and only once.
 */
create type public.contest_progress_status as enum ('pending', 'confirmed', 'rejected');

-- ============================================================================
-- 2. contest_deliverables, reshaped
-- ============================================================================
/*
 * The old three kinds collapse to one shape: a type, a target and a reward.
 *
 * `fixed` survives as video_count. `milestone` survives as gmv, with `metric`
 * replaced by the enum and `threshold` by target_value, which is the same column
 * finally named after what an admin types into it. `rank` has nothing to survive
 * as, because there is no placing to pay for.
 *
 * Every drop below is safe only because the table is empty. Read the header.
 */

-- The rank uniqueness goes first. It would fall with the column it indexes, but
-- an index dropped by a cascade nobody typed is how a uniqueness rule comes back
-- later as a bug report.
drop index if exists public.contest_deliverables_rank_idx;

alter table public.contest_deliverables
  drop column if exists rank_position,
  drop column if exists metric,
  drop column if exists threshold,
  drop column if exists video_count,
  drop column if exists kind;

/*
 * THE TYPE. Not null, no default, and no default is the point: the admin picks
 * it in the popup and nothing picks it for him, exactly as the title rule
 * already works on this table.
 */
alter table public.contest_deliverables
  add column type public.contest_deliverable_type not null;

/*
 * THE TARGET THE CREATOR HAS TO REACH. numeric, because a GMV target is money
 * and a video target is a count, and one column cannot be two types. The whole
 * number rule for video_count is a check rather than a second column, so there
 * is one place a target is read from on every screen.
 *
 * Greater than zero, not at least zero. A deliverable with a target of nothing
 * is earned by entering, which is not a deliverable.
 */
alter table public.contest_deliverables
  add column target_value numeric(14, 2) not null
    check (target_value > 0);

/*
 * THE REWARD IS NOW REQUIRED. It was nullable when a row could be a rank with
 * its prize typed later; a row is now nothing but "reach this, earn that", so a
 * reward of nothing is a row with no purpose. Zero is still legal and means an
 * unpaid deliverable, which the brief-only case needs.
 *
 * The nullable check that shipped with the column is dropped by name rather than
 * left in place. It is satisfied by every value the new pair allows, so it would
 * never fire, and a constraint that can never fire is one somebody later reads
 * as the rule.
 */
alter table public.contest_deliverables
  drop constraint if exists contest_deliverables_reward_amount_check;

update public.contest_deliverables set reward_amount = 0 where reward_amount is null;

alter table public.contest_deliverables
  alter column reward_amount set not null,
  add constraint contest_deliverables_reward_nonneg check (reward_amount >= 0);

-- A video target is a whole number of videos, and the same 1 to 1000 bound the
-- dropped video_count column carried, so a target can never be a number the
-- product could not accept. A gmv target is bounded by numeric(14, 2) and by the
-- typo guard inside save_contest_deliverable.
alter table public.contest_deliverables
  add constraint contest_deliverables_video_target_whole check (
    type <> 'video_count'
    or (target_value = trunc(target_value) and target_value between 1 and 1000)
  );

/*
 * THERE IS DELIBERATELY NO UNIQUENESS ON (contest_id, type). Two active gmv rows
 * on one contest is the TIERED shape Rashid asked for by name: 500 pays 50, 1000
 * pays 120, and both are earned by the same person on the way past. The old rank
 * index existed because two people cannot both be second; nothing here has that
 * property, and adding a unique index "for tidiness" would delete the feature.
 */
create index contest_deliverables_type_idx
  on public.contest_deliverables (contest_id, type)
  where is_active;

comment on table public.contest_deliverables is
  'What a contest asks for and what each thing pays: a type, a target the creator has to reach, and the reward for reaching it. Several creators can earn the same row. No placings, no ranking, and no uniqueness per type, because tiered targets on one measure are the normal case.';

comment on column public.contest_deliverables.target_value is
  'The number the creator has to reach. Read only to creators in the browser AND on the wire: no function a creator can reach takes a target argument.';

-- ============================================================================
-- 3. contest_entry_terms, the frozen promise, reshaped to match
-- ============================================================================
/*
 * Terms are a COPY of the deliverable rows at the moment somebody was approved,
 * so they carry the same five facts or the copy is not one. Reshaped in the same
 * pass for a second reason as well: contest_deliverable_kind cannot be dropped
 * while this table still names it.
 */

alter table public.contest_entry_terms
  drop column if exists rank_position,
  drop column if exists metric,
  drop column if exists threshold,
  drop column if exists video_count,
  drop column if exists kind;

alter table public.contest_entry_terms
  add column type public.contest_deliverable_type not null,
  add column target_value numeric(14, 2) not null check (target_value > 0);

alter table public.contest_entry_terms
  drop constraint if exists contest_entry_terms_reward_amount_check;

update public.contest_entry_terms set reward_amount = 0 where reward_amount is null;

alter table public.contest_entry_terms
  alter column reward_amount set not null,
  add constraint contest_entry_terms_reward_nonneg check (reward_amount >= 0);

alter table public.contest_entry_terms
  add constraint contest_entry_terms_video_target_whole check (
    type <> 'video_count'
    or (target_value = trunc(target_value) and target_value between 1 and 1000)
  );

/*
 * The old function goes BEFORE the old type, and the order is not cosmetic.
 *
 * `save_contest_deliverable` takes the old enum as its third argument, so a
 * function signature depends on the type and Postgres refuses to drop it:
 *
 *   cannot drop type contest_deliverable_kind because other objects depend on it
 *
 * The recreated version is written further down this file, and `create or
 * replace` cannot be used for it because changing an argument type makes it a
 * different function rather than a replacement. So the old one is dropped here,
 * by its full old signature, and the new one is created later.
 */
drop function if exists public.save_contest_deliverable(
  uuid, uuid, public.contest_deliverable_kind, text, uuid, text, integer,
  integer, text, numeric, numeric, integer, boolean
);

-- Nothing names the old type any more.
drop type if exists public.contest_deliverable_kind;

-- ============================================================================
-- 4. contests.judging_basis goes
-- ============================================================================
/*
 * It existed for exactly one reason, stated on the column: a placing with no
 * stated basis is the one thing that would make a contest feel arbitrary. There
 * are no placings, so there is no basis to state, and the deliverable rows now
 * say what a creator has to do in numbers rather than in a sentence.
 *
 * Rule N7 goes with it, in both directions, and both refusals are removed from
 * save_contest and save_contest_deliverable below. A rule with nothing to
 * enforce is worse than no rule: it is a paragraph somebody rebuilds a feature
 * from.
 *
 * Nothing has been published that quotes it. The creator contest screen renders
 * the deliverable list, and the admin setup screen is being redrawn against this
 * migration in the same step.
 */
alter table public.contests drop column if exists judging_basis;

-- ============================================================================
-- 5. contest_progress_updates, what the creator says they have achieved
-- ============================================================================
/*
 * ONE ROW PER CLAIM, never an edit of the last one, because the history is the
 * evidence. A creator says "I am at 640 GMV and 6 videos", staff confirm or
 * refuse it, and only the confirmed rows are ever money.
 *
 * THE FIGURES ARE CUMULATIVE TOTALS, NOT INCREMENTS. Rashid was explicit. So the
 * confirmed total for an entry is the LATEST confirmed row rather than the sum
 * of them, which is what section 8 builds, and adding these columns up anywhere
 * is the single arithmetic error this table can cause.
 *
 * status = 'pending' IS WHAT A CREATOR WRITES AND ALL THEY CAN WRITE. There is
 * no insert, update or delete policy on this table, exactly like the other
 * eleven, so the only door is submit_contest_progress behind the Edge Function.
 */
create table public.contest_progress_updates (
  id uuid primary key default gen_random_uuid(),

  entry_id uuid not null references public.contest_entries (id) on delete cascade,

  /*
   * Denormalised, for the same two reasons contest_entry_events.creator_id is:
   * the read policy never has to reach into contest_entries, which is a table
   * with an unrestricted staff policy on it, and "everything this creator has
   * ever claimed" is one index rather than a join.
   */
  creator_id uuid not null references public.profiles (id) on delete cascade,

  -- What they say they have done, in total, as of this moment.
  gmv numeric(14, 2) not null default 0 check (gmv >= 0),
  video_count integer not null default 0 check (video_count >= 0),

  status public.contest_progress_status not null default 'pending',

  /*
   * MESSAGE, NOT REASON, and this is decision D14 applied to a third column
   * because the same trap has now bitten twice: contests.cancel_message was
   * named for it, and review_contest_entry had to be dropped and recreated with
   * a sixth argument because ONE note was being written into a creator readable
   * column and a staff only one at the same time.
   *
   * THE CREATOR READS THIS. It is the sentence under a refused figure, and it is
   * the only place they will be told why. A column called "reason" invites
   * somebody at eleven at night to type an internal judgement into a box the
   * person it is about then opens. Named `staff_message` rather than `message`
   * so that the admin form's label writes itself.
   */
  staff_message text check (
    staff_message is null or length(trim(staff_message)) between 1 and 500
  ),

  /*
   * The decision stamp, and it stamps a REFUSAL as well as a confirmation. The
   * names come from the act that matters, confirming, and a rejected row carries
   * them too rather than gaining two more columns that would then be able to
   * disagree with these.
   */
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Decided means stamped, and pending means unstamped. Both directions, so a
  -- row cannot claim a decision nobody made or hide one somebody did.
  check ((confirmed_at is null) = (confirmed_by is null)),
  check ((status = 'pending') = (confirmed_at is null))
);

comment on table public.contest_progress_updates is
  'What a creator says they have achieved on one contest entry, and what staff decided about it. CUMULATIVE totals, never increments. A pending or rejected row is a claim and nothing more: money is only ever owed against a confirmed one. No insert, update or delete policy, on purpose.';

comment on column public.contest_progress_updates.staff_message is
  'The sentence the CREATOR reads under a refused or confirmed figure. Message, not reason (decision D14): nothing internal goes in here.';

/*
 * ONE PENDING UPDATE PER ENTRY AT A TIME, as an index rather than only as a
 * refusal inside the function, so it holds against a direct service key write
 * and against two taps arriving at once.
 *
 * The failure it prevents is not tidiness. Claims are cumulative, so a creator
 * with a pending 5 and a pending 7 whose 7 is confirmed and whose 5 is refused
 * has a confirmed total of 7 videos, five of which were filed against a row
 * staff said no to. Staff would be reviewing two claims that overlap, and there
 * is no reading of "confirmed" that survives it.
 */
create unique index contest_progress_updates_one_pending_idx
  on public.contest_progress_updates (entry_id)
  where status = 'pending';

-- The creator's own history on one entry, newest first. Also the read behind
-- "what did I say last time", which the second step of the form needs.
create index contest_progress_updates_entry_idx
  on public.contest_progress_updates (entry_id, created_at desc);

-- "Everything this creator has ever claimed", one index, no join.
create index contest_progress_updates_creator_idx
  on public.contest_progress_updates (creator_id, created_at desc);

-- The staff queue: everything waiting, oldest first, and it stays small for ever
-- because a decided row leaves the index.
create index contest_progress_updates_queue_idx
  on public.contest_progress_updates (created_at)
  where status = 'pending';

create trigger contest_progress_updates_touch_updated_at
  before update on public.contest_progress_updates
  for each row execute function public.touch_updated_at();

alter table public.contest_progress_updates enable row level security;

create policy "contest_progress_updates_select_staff" on public.contest_progress_updates
  for select to authenticated using (public.is_staff());

create policy "contest_progress_updates_select_own" on public.contest_progress_updates
  for select to authenticated using (creator_id = (select auth.uid()));

-- No insert, update or delete policy. The Edge Functions are the only door.

grant select on public.contest_progress_updates to authenticated;
-- Auto expose is off, which also switches off the default grants to
-- service_role. Missing this line is how a function ships seeing nothing.
grant all privileges on table public.contest_progress_updates to service_role;

/*
 * NOT ADDED TO supabase_realtime, deliberately, and for the reason section 16 of
 * the schema migration and section 7 of the corrections both give: row security
 * is not applied to DELETE events, and delete_contest cascades these rows away.
 * A creator's claimed GMV would broadcast to any subscriber who opened a channel
 * without a creator_id filter, which they can do by hand.
 *
 * It needs none anyway. A claim changes because the creator typed it in a tab
 * they are looking at, or because staff decided it, and the staff decision goes
 * through an Edge Function whose response invalidates the queue that called it.
 */

-- ============================================================================
-- 6. The videos that came with an update
-- ============================================================================
/*
 * "Show me the new videos for this claim" has to be answerable, or staff
 * confirming "6 videos" are looking at a list of everything the creator has ever
 * filed and counting by hand.
 *
 * NULLABLE, because contest_submissions rows can arrive by the other door:
 * submit_contest_content files one video on its own and belongs to no update.
 * Both doors stay open, which is right, and this column is how a row says which
 * one it came through.
 *
 * ON DELETE SET NULL, never cascade. Removing a claim must not remove the work.
 * Nothing deletes a progress update today and nothing should, but the day
 * somebody writes that function the videos must survive it.
 */
alter table public.contest_submissions
  add column progress_update_id uuid
    references public.contest_progress_updates (id) on delete set null;

create index contest_submissions_progress_idx
  on public.contest_submissions (progress_update_id)
  where progress_update_id is not null;

comment on column public.contest_submissions.progress_update_id is
  'The progress update that declared this video, when it came in through submit_contest_progress. Null for a video filed on its own. This is how "the new videos for this claim" is answered without counting by hand.';

-- ============================================================================
-- 7. assert_contest_within_budget, without the three kinds
-- ============================================================================
/*
 * Rule M7, unchanged in meaning and simpler in body. It split the sum into fixed
 * and placed halves so that the refusal could quote both, because "the rewards
 * add up to 3,000" on a contest whose fixed rows total 200 was a sentence an
 * admin could not act on. There is one kind of reward row now, so there is one
 * number, and the split would be two names for the same total.
 *
 * Still NOT marked stable: every caller holds a lock and has usually just
 * written the row it is asking about.
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
  v_total numeric;
  v_rows  integer;
begin
  if p_budget is null then
    return;
  end if;

  select coalesce(sum(d.reward_amount), 0), count(*)
  into v_total, v_rows
  from public.contest_deliverables d
  where d.contest_id = p_contest_id and d.is_active;

  if v_total > p_budget then
    raise exception
      'the % reward row(s) on this contest add up to % %, which is more than the % % budget',
      v_rows, v_total, p_currency, p_budget, p_currency
      using errcode = '22023';
  end if;
end;
$$;

comment on function public.assert_contest_within_budget(uuid, text, numeric) is
  'Rule M7. Refuses when the active reward rows on a contest add up to more than the budget it carries. Quoted by save_contest, save_contest_deliverable, save_contest_commercials and settle_contest so no two of them can answer differently. Counts a reward ONCE rather than once per entrant, which is deliberate: several creators can earn the same one.';

revoke all on function public.assert_contest_within_budget(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.assert_contest_within_budget(uuid, text, numeric)
  to service_role;

-- ============================================================================
-- 8. save_contest, one argument shorter
-- ============================================================================
/*
 * DROPPED AND RECREATED rather than replaced, because `create or replace` cannot
 * remove a parameter. The drop is also the point: a stale deployment that still
 * passes p_judging_basis must fail loudly at the call rather than bind to an old
 * overload and write a column that no longer exists.
 *
 * TWO THINGS ARE GONE FROM THE BODY and everything else is the applied text of
 * 20260813230000 word for word:
 *
 *   - p_judging_basis, the column, and its audit fields.
 *   - The N7 refusal that would not let the sentence be cleared while ranked
 *     prizes were live. There are no ranked prizes.
 */
drop function if exists public.save_contest(
  uuid, uuid, text, timestamptz, text, uuid, text, text, text, text, timestamptz,
  text, public.contest_status, boolean
);

create or replace function public.save_contest(
  p_actor_id uuid,
  p_brand_id uuid,
  p_name text,
  p_expires_at timestamptz,
  p_expires_at_timezone text,
  p_contest_id uuid default null,
  p_description text default null,
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
  v_brief    text := nullif(trim(coalesce(p_brief_url, '')), '');
  v_banner   text := nullif(trim(coalesce(p_banner_url, '')), '');
  v_zone     text := nullif(trim(coalesce(p_expires_at_timezone, '')), '');
  v_currency text := upper(coalesce(nullif(trim(coalesce(p_currency, '')), ''), 'USD'));
  v_opens    timestamptz;
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

  -- An offset like '+01:00' and an abbreviation like 'BST' both look plausible
  -- and both fail here. An offset is wrong twice a year, and 'BST' is ambiguous
  -- between British Summer Time and Bougainville Standard Time.
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

    -- No M7 check on the create path: a contest that does not exist yet carries
    -- no deliverables, so there is no reward to exceed a budget. It arrives with
    -- the first save_contest_deliverable call, which carries the refusal.
    insert into public.contests (
      brand_id, name, description, brief_url, banner_url,
      status, needs_admin_approval, opens_at, expires_at, expires_at_timezone,
      currency, created_by
    )
    values (
      p_brand_id, v_name, v_desc, v_brief, v_banner,
      coalesce(p_status, 'inactive'), coalesce(p_needs_admin_approval, true),
      v_opens, p_expires_at, v_zone, v_currency, v_actor.id
    )
    returning * into v_contest;

    v_action := 'contest.created';
  else
    /*
     * Locked before ANY branch decides anything, and matched on brand_id as well
     * as id. contests.brand_id is never updatable (rule F6): a contest moving
     * between brands would silently spend one brand's budget on another brand's
     * products.
     */
    select * into v_before
    from public.contests
    where id = p_contest_id and brand_id = p_brand_id
    for update;

    if not found then
      raise exception 'no such contest on that brand' using errcode = 'P0002';
    end if;

    -- Terminal means terminal for the whole row, not for the deadline alone.
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

    -- L11. Extending an expired but unsettled contest is fine and audited;
    -- pulling the deadline back to now or earlier while people are in it is not,
    -- however innocent the typo looked.
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

    -- The N7 refusal used to sit here, and it is gone with judging_basis. There
    -- are no ranked prizes to need a stated basis.

    -- M7, under the lock this function already holds.
    select c.total_budget into v_budget
    from public.contest_commercials c
    where c.contest_id = p_contest_id;

    perform public.assert_contest_within_budget(p_contest_id, v_currency, v_budget);

    update public.contests
    set name                 = v_name,
        description          = v_desc,
        brief_url            = v_brief,
        banner_url           = v_banner,
        status               = coalesce(p_status, v_before.status),
        needs_admin_approval = coalesce(p_needs_admin_approval, v_before.needs_admin_approval),
        opens_at             = v_opens,
        expires_at           = p_expires_at,
        expires_at_timezone  = v_zone,
        currency             = v_currency
    -- brand_id is deliberately absent from this SET list. See rule F6.
    where id = p_contest_id
    returning * into v_contest;

    v_action := 'contest.updated';
  end if;

  -- The deadline and its zone travel together, for the same reason the two
  -- columns do: one without the other is a different moment.
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
      'brief_url', v_contest.brief_url,
      'banner_url', v_contest.banner_url,
      -- A boolean as well as the value, because jsonb_strip_nulls removes a
      -- cleared field entirely and "who took the artwork down" is exactly the
      -- question the log is asked.
      'has_banner', v_contest.banner_url is not null
    ))
  );

  return to_jsonb(v_contest);
end;
$$;

revoke all on function public.save_contest(
  uuid, uuid, text, timestamptz, text, uuid, text, text, text, timestamptz,
  text, public.contest_status, boolean
) from public, anon, authenticated;
grant execute on function public.save_contest(
  uuid, uuid, text, timestamptz, text, uuid, text, text, text, timestamptz,
  text, public.contest_status, boolean
) to service_role;

-- ============================================================================
-- 9. save_contest_deliverable, the popup behind the Add deliverable button
-- ============================================================================
/*
 * DROPPED AND RECREATED, for the same two reasons as save_contest and one more:
 * the old signature names contest_deliverable_kind, and that type cannot be
 * dropped while a function's argument list still refers to it. The drop had to
 * happen above section 3 in reading order and happens here in execution order,
 * which is why the drop of the type sits at the end of section 3.
 *
 * THE WHOLE FORM IS FOUR FIELDS NOW: type, title, target, reward. p_target_value
 * and p_reward_amount are required arguments rather than defaulted ones,
 * deliberately, because a deliverable is meaningless without either and a
 * defaulted argument is how a client that forgot one writes a row anyway.
 *
 * GONE FROM THE BODY: the three per-kind shape refusals, the N7 judging-basis
 * refusal, and the "two people cannot both be second" refusal. Several creators
 * earning the same reward is now the design rather than a collision.
 */
drop function if exists public.save_contest_deliverable(
  uuid, uuid, public.contest_deliverable_kind, text, uuid, text, integer, integer,
  text, numeric, numeric, integer, boolean
);

create or replace function public.save_contest_deliverable(
  p_actor_id uuid,
  p_contest_id uuid,
  p_type public.contest_deliverable_type,
  p_title text,
  p_target_value numeric,
  p_reward_amount numeric,
  p_deliverable_id uuid default null,
  p_detail text default null,
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
  v_active   boolean := coalesce(p_is_active, true);
  v_frozen   boolean;
  v_budget   numeric;
  v_action   text;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  -- Nothing generates this. A row arriving with spaces in it is refused here,
  -- again in the Edge Function's Zod schema, and again by the column check.
  if v_title is null then
    raise exception 'that deliverable needs a title, nothing writes one for you'
      using errcode = '22023';
  end if;

  if p_type is null then
    raise exception 'pick what this deliverable asks for' using errcode = '22023';
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

  /*
   * The target, said in words an admin can act on. The column checks are the
   * guarantee; these are the sentences, because a check constraint violation is
   * not one.
   */
  if p_target_value is null or p_target_value <= 0 then
    raise exception 'a deliverable needs a target above zero for the creator to reach'
      using errcode = '22023';
  end if;

  if p_type = 'video_count' then
    if p_target_value <> trunc(p_target_value) then
      raise exception 'a video target is a whole number of videos, not %', p_target_value
        using errcode = '22023';
    end if;
    if p_target_value > 1000 then
      raise exception 'a video target above 1000 is a typo, not a contest'
        using errcode = '22023';
    end if;
  end if;

  -- The GMV ceiling is the column's own numeric(14, 2). This is the typo guard
  -- underneath it, because a trailing zero on a GMV target is the mistake that
  -- makes a whole contest unreachable and nobody would say so until the deadline.
  if p_type = 'gmv' and p_target_value > 100000000 then
    raise exception 'a GMV target of % looks like a typo', p_target_value
      using errcode = '22023';
  end if;

  if p_reward_amount is null or p_reward_amount < 0 then
    raise exception 'a deliverable needs the reward for reaching it, zero if it pays nothing'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.contest_entry_terms t
    join public.contest_entries e on e.id = t.entry_id
    where e.contest_id = p_contest_id
  ) into v_frozen;

  if p_deliverable_id is null then
    insert into public.contest_deliverables (
      contest_id, type, title, detail, target_value, reward_amount, sort_order, is_active
    )
    values (
      p_contest_id, p_type, v_title, v_detail, p_target_value, p_reward_amount,
      coalesce(p_sort_order, 0), v_active
    )
    returning * into v_row;

    v_action := 'created';
  else
    select * into v_before
    from public.contest_deliverables
    where id = p_deliverable_id and contest_id = p_contest_id
    for update;

    if not found then
      raise exception 'no such deliverable on that contest' using errcode = 'P0002';
    end if;

    /*
     * F2. Once somebody holds a frozen promise, the numbers on an existing row
     * are what they agreed to, and re-scoping them here would move the goalposts
     * on somebody already filming. Add a new row instead, or retire this one:
     * both are always allowed and both are audited.
     *
     * The list is shorter than it was only because the row is. Type, target and
     * reward are the whole of what somebody was promised.
     */
    if v_frozen and (
         p_reward_amount is distinct from v_before.reward_amount
      or p_target_value  is distinct from v_before.target_value
      or p_type          is distinct from v_before.type
    ) then
      raise exception
        'somebody has already been promised this deliverable as it stands, so add a new one instead of changing it'
        using errcode = '22023';
    end if;

    update public.contest_deliverables
    set type          = p_type,
        title         = v_title,
        detail        = v_detail,
        target_value  = p_target_value,
        reward_amount = p_reward_amount,
        sort_order    = coalesce(p_sort_order, 0),
        is_active     = v_active
    where id = p_deliverable_id and contest_id = p_contest_id
    returning * into v_row;

    v_action := 'updated';
  end if;

  -- M7, after the write and under the contest lock, so the figure quoted back is
  -- the one the contest now carries. A single reward arithmetically larger than
  -- the whole pot on the day it is typed is a typo, and nothing else in the
  -- product would say so until somebody was owed it.
  select c.total_budget into v_budget
  from public.contest_commercials c
  where c.contest_id = p_contest_id;

  perform public.assert_contest_within_budget(p_contest_id, v_contest.currency, v_budget);

  select * into v_brand from public.brands where id = v_contest.brand_id;

  -- Audited as contest.updated rather than as a verb of its own. The registered
  -- verb list in rule A1 is closed, and a deliverable is a change to the
  -- contest: the subject an admin opens from the activity log is the contest,
  -- not a row id they have never seen.
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest.updated', 'contest', v_contest.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'contest', v_contest.name,
      'deliverable', v_action,
      'type', v_row.type::text,
      'title', v_row.title,
      'target_value', v_row.target_value,
      'reward_amount', v_row.reward_amount,
      'currency', v_contest.currency,
      'is_active', v_row.is_active
    ))
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.save_contest_deliverable(
  uuid, uuid, public.contest_deliverable_type, text, numeric, numeric, uuid, text,
  integer, boolean
) from public, anon, authenticated;
grant execute on function public.save_contest_deliverable(
  uuid, uuid, public.contest_deliverable_type, text, numeric, numeric, uuid, text,
  integer, boolean
) to service_role;

-- ============================================================================
-- 10. retire_contest_deliverable, kept, one word different
-- ============================================================================
/*
 * KEPT, and it does the same job it always did: soft disable, never delete,
 * because entrants have snapshotted these rows onto contest_entry_terms.
 *
 * Replaced only because its audit detail reads v_row.kind, and a plpgsql body is
 * stored as text and re-parsed at execution, so a dropped column breaks it at
 * run time rather than at migration time. That is the whole diff.
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
    raise exception 'no such deliverable' using errcode = 'P0002';
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
      'deliverable', 'retired',
      'type', v_row.type::text,
      'title', v_row.title,
      'target_value', v_row.target_value,
      'reward_amount', v_row.reward_amount,
      'currency', v_contest.currency
    ))
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.retire_contest_deliverable(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.retire_contest_deliverable(uuid, uuid) to service_role;

-- ============================================================================
-- 11. The two functions that freeze a promise, reshaped
-- ============================================================================
/*
 * apply_for_contest and review_contest_entry both copy every active deliverable
 * onto contest_entry_terms and both compute what an entrant is committed to.
 * Both read columns that no longer exist, so both are replaced, and the diff in
 * each is the same three lines.
 *
 * WHAT COMMITTED MEANS NOW, because rule M8 split it and the split has gone with
 * placings. Every deliverable is "reach this, earn that", which is exactly what
 * the old `fixed` kind was, so committed_amount is the sum of EVERY active
 * reward rather than of the fixed ones only, and committed_video_count is the
 * sum of the video_count TARGETS. Nothing is contingent on a placing any more
 * because there are no placings; it is contingent on reaching a number, and
 * whether somebody reached it is decided by staff confirming a progress update.
 *
 * committed_video_count keeps feeding contest_entry_progress unchanged, which is
 * the tracker on the creator's own entry.
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
  -- role = 'creator' exactly. is_approved_creator() admits ops and admin so they
  -- can BROWSE; entering is a narrower gate on purpose (rule E6).
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

  -- Exclusion, through the ONE definition in the schema migration. The two
  -- argument form is used here because the actor is already asserted; the
  -- caller-only wrapper is for the policy bodies.
  v_excluded := public.contest_excludes(p_contest_id, v_actor.id);

  if v_excluded then
    -- Raised, not inserted-then-raised: a raise aborts the transaction and would
    -- take any audit row with it, so the record of the attempt is written by the
    -- Edge Function afterwards through record_contest_exclusion_attempt (X4).
    -- One flat sentence that names no reason (D3).
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

  /*
   * EVERY active reward now, not the fixed ones. There is one kind of
   * deliverable and reaching its target earns it, so there is nothing left that
   * only commits at settlement.
   *
   * The video commitment is the sum of the video_count TARGETS, cast to integer
   * because the column is one and target_value is numeric; the whole number
   * check on the table is what makes that cast lossless.
   */
  if not v_contest.needs_admin_approval then
    select coalesce(sum(d.reward_amount), 0),
           nullif(coalesce(sum(d.target_value) filter (where d.type = 'video_count'), 0), 0)::integer
    into v_amount, v_videos
    from public.contest_deliverables d
    where d.contest_id = p_contest_id and d.is_active;
  end if;

  insert into public.contest_entries (
    contest_id, brand_id, creator_id, creator_handle, creator_name, creator_email,
    status, auto_approved, currency, committed_amount, committed_video_count, note,
    decided_at
  )
  values (
    p_contest_id, v_contest.brand_id, v_actor.id, v_handle, v_actor.display_name,
    v_actor.email,
    -- Cast on both arms: a CASE whose arms are two bare literals resolves to
    -- TEXT, and text into an enum column is an explicit cast rather than an
    -- assignment one.
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
      entry_id, deliverable_id, type, title, detail, target_value, reward_amount, currency
    )
    select v_row.id, d.id, d.type, d.title, d.detail, d.target_value,
           d.reward_amount, v_contest.currency
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

revoke all on function public.apply_for_contest(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_for_contest(uuid, uuid, text) to service_role;

/*
 * review_contest_entry, same signature as the six argument form the corrections
 * migration created, same body, three lines different. p_note is read by the
 * creator it is about; p_block_reason is read by nobody outside the team, and
 * they are two arguments because they were once one.
 */
create or replace function public.review_contest_entry(
  p_actor_id uuid,
  p_entry_id uuid,
  p_decision public.contest_entry_status,
  -- THE CREATOR THIS IS ABOUT READS THIS.
  p_note text default null,
  p_block boolean default false,
  -- AND NOBODY OUTSIDE THE TEAM READS THIS.
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
    -- Read the terms ONCE, here, and keep them. The frozen rows are the promise;
    -- the contest may be edited afterwards and this must not move.
    select coalesce(sum(d.reward_amount), 0),
           nullif(coalesce(sum(d.target_value) filter (where d.type = 'video_count'), 0), 0)::integer
    into v_amount, v_videos
    from public.contest_deliverables d
    where d.contest_id = v_row.contest_id and d.is_active;
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
      entry_id, deliverable_id, type, title, detail, target_value, reward_amount, currency
    )
    select v_row.id, d.id, d.type, d.title, d.detail, d.target_value,
           d.reward_amount, v_contest.currency
    from public.contest_deliverables d
    where d.contest_id = v_row.contest_id and d.is_active;
  end if;

  /*
   * The block flag writes the exclusion in the same transaction as the
   * rejection, and both creator select policies on `contests` read it back, so
   * the contest goes dark for that person rather than keeping a lit Apply button
   * they would be refused at.
   *
   * THE REASON HERE IS p_block_reason AND NEVER p_note. contest_exclusions.reason
   * is staff only; contest_entries.decision_note and contest_entry_events.note
   * are both selectable in full by the creator they are about.
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

revoke all on function public.review_contest_entry(
  uuid, uuid, public.contest_entry_status, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.review_contest_entry(
  uuid, uuid, public.contest_entry_status, text, boolean, text
) to service_role;

-- ============================================================================
-- 12. settle_contest, without the kind it used to refuse
-- ============================================================================
/*
 * Replaced for ONE clause. It refused to award a term whose kind was 'fixed',
 * because a fixed reward committed when the entry was approved and awarding it
 * again would write a second contest_awards row for money contest_totals.committed
 * already counted. There is no kind column to test any more.
 *
 * WHAT THAT MEANS, said plainly rather than left as a deleted paragraph. Rule M8
 * split rewards into two moments of truth: fixed money committed at approval,
 * ranked and milestone money committed at settlement, because at approval nobody
 * knew who would win. Placings are gone, so nothing is contingent on other
 * entrants and every reward commits at approval. Settlement is now the moment
 * staff RELEASE money against confirmed progress rather than the moment they
 * discover who won it, and `committed` and `awarded` in brand_contest_totals
 * stay what they always were: the offer and the bill, two columns, never added
 * together.
 *
 * TWO THINGS ARE LEFT FOR THE SETTLE SCREEN, which does not exist yet and is not
 * built in this step. Neither is a hole in this migration and both are written
 * down so they are not discovered:
 *
 *   - contest_awards.placement and contest_awards_placement_idx survive, and
 *     with placings dropped nothing should be writing a placement. The column is
 *     still reachable through p_outcomes, so the screen must not offer it and
 *     the next migration on this feature should drop it. It is not dropped here
 *     because doing so changes settlement's shape, and settlement is not what
 *     Rashid redesigned tonight.
 *   - Nothing in this function yet checks that an entrant actually REACHED the
 *     target of the term being awarded. That check belongs beside the confirmed
 *     totals in section 14, and it is the settle screen's job to show the
 *     confirmed figure next to the target so a human decides. Money still cannot
 *     move without a staff action either way.
 */
create or replace function public.settle_contest(
  p_actor_id uuid,
  p_contest_id uuid,
  p_outcomes jsonb,
  p_note text default null,
  -- A suspended entrant is refused money unless somebody says so out loud
  -- (rule S8). They keep their entry and their terms either way.
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

  -- L12. Applicants must not be left pending forever on a settled contest, in no
  -- queue and getting no decision.
  select count(*) into v_count
  from public.contest_entries e
  where e.contest_id = p_contest_id and e.status = 'pending';

  if v_count > 0 then
    raise exception
      'creators are still waiting on this contest, decide those % entry(ies) first', v_count
      using errcode = '23503';
  end if;

  -- One outcome per entry, and no entry twice.
  select count(*), count(distinct (o.value->>'entry_id')) into v_count, v_entrants
  from jsonb_array_elements(v_outcomes) o;

  if v_count <> v_entrants then
    raise exception 'one of those entrants is listed twice' using errcode = '22023';
  end if;

  -- A contest cannot half settle. Every approved entrant reads their own outcome
  -- row afterwards, so a missing one is a creator with nothing to read.
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

    -- THE OUTCOME ROW. Written for everybody, worth zero. Keeping money off it is
    -- what stops brand_contest_totals double counting.
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
        raise exception 'that reward is not one of the things this entrant was promised'
          using errcode = 'P0002';
      end if;
      if coalesce(v_term.reward_amount, 0) <= 0 then
        raise exception '"%" carries no amount, so there is nothing to award for it', v_term.title
          using errcode = '22023';
      end if;

      -- The M8 refusal on a fixed term used to sit here. It cannot be restated,
      -- because with placings gone there is no second kind for it to tell a fixed
      -- one apart from. Read the block above this function before adding
      -- anything back in its place.

      -- S8. A suspended creator keeps everything they were promised; paying one
      -- out is a decision somebody makes on purpose rather than a row that slips
      -- through with the rest.
      if not coalesce(p_allow_suspended, false) and not exists (
        select 1 from public.profiles p where p.id = v_entry.creator_id and p.is_active
      ) then
        raise exception 'that entrant''s account is suspended, so their reward needs to be released on purpose'
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

    -- L13. No entrant is left sitting at approved on a dead contest with nothing
    -- on their own history saying what happened.
    insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
    values (v_entry.id, v_entry.creator_id, 'settled', coalesce(v_row_note, v_note), v_actor.id);

    -- A1: contest_entry.awarded fires once per ENTRANT rather than once per
    -- winner, because settlement records an outcome for everybody.
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

  -- M7 at the event where the money is actually spent, compared against what is
  -- being written rather than against the reward rows, because those are an offer
  -- and this is the bill.
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

revoke all on function public.settle_contest(uuid, uuid, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.settle_contest(uuid, uuid, jsonb, text, boolean)
  to service_role;

-- ============================================================================
-- 13. submit_contest_progress, the creator's own figures
-- ============================================================================
/*
 * THE CREATOR TYPES WHAT THEY HAVE ACHIEVED, AND NOTHING ELSE EXISTS TO TYPE.
 *
 * Read the argument list first, because it is the security design rather than an
 * interface: an actor, an entry, a GMV figure, a video count, and the new videos.
 * THERE IS NO TARGET ARGUMENT AND NO REWARD ARGUMENT. A creator cannot write a
 * target by sending one, because there is nowhere for it to arrive; they cannot
 * write another creator's figure, because the entry is matched on creator_id and
 * the row carries the creator_id read from the matched entry rather than one from
 * the request; and they cannot confirm their own claim, because the status is not
 * an argument either and the insert hard codes 'pending'.
 *
 * p_actor_id is supplied by the Edge Function from the verified JWT and never by
 * the browser. This function is granted to service_role alone, so it is not a
 * PostgREST endpoint and there is no other way in.
 *
 * THE FIGURES ARE CUMULATIVE. "I am at 640 GMV and 6 videos", not "I did 140 more
 * GMV". So:
 *
 *   GMV is simply the new figure, and it may go down, because a correction is a
 *   normal thing and a creator who fat fingered 6400 has to be able to fix it.
 *
 *   THE VIDEO COUNT MAY NEVER GO DOWN. Videos are individually filed and
 *   individually reviewed; a count below one already declared would orphan
 *   submissions and change what staff already looked at. Refused by naming both
 *   numbers, because "that is too low" on a form with one box is not actionable.
 *
 *   ONLY THE NEW VIDEOS ARE ASKED FOR. Going from 5 to 6 asks for ONE link and
 *   ad code, not six. The earlier five are shown and stay editable through the
 *   normal content path, and they are never re-entered.
 *
 * NOTHING HERE COUNTS UNTIL STAFF CONFIRM IT. The row lands as `pending` and the
 * confirmed totals in section 14 read confirmed rows only.
 */
create or replace function public.submit_contest_progress(
  p_actor_id uuid,
  p_entry_id uuid,
  p_gmv numeric,
  p_video_count integer,
  -- An array of objects: video_url, ad_code, and optionally ad_authorized,
  -- thumbnail_url, video_title, video_author, embed_id. Exactly the NEW ones.
  p_videos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_entry    public.contest_entries%rowtype;
  v_contest  public.contests%rowtype;
  v_row      public.contest_progress_updates%rowtype;
  v_videos   jsonb := coalesce(p_videos, '[]'::jsonb);
  v_video    jsonb;
  v_gmv      numeric := coalesce(p_gmv, 0);
  v_count    integer := coalesce(p_video_count, 0);
  v_prev     integer;
  v_new      integer;
  v_given    integer;
  v_distinct integer;
  v_url      text;
  v_code     text;
begin
  v_actor := public.assert_active_creator(p_actor_id);

  /*
   * MATCHED ON creator_id AS WELL AS THE ID, the same rule
   * withdraw_contest_entry and submit_contest_content follow. Without it a
   * creator who knows somebody else's entry id could type figures onto their
   * work, which is the exact attack this whole feature has to survive.
   */
  select * into v_entry
  from public.contest_entries
  where id = p_entry_id and creator_id = v_actor.id
  for update;

  if not found then
    raise exception 'that is not one of your contests' using errcode = '42501';
  end if;
  if v_entry.status <> 'approved' then
    raise exception 'you can only update progress on a contest you are in'
      using errcode = '22023';
  end if;

  select * into v_contest from public.contests where id = v_entry.contest_id;
  if v_contest.settled_at is not null then
    raise exception 'that contest has been settled' using errcode = '22023';
  end if;
  if v_contest.cancelled_at is not null then
    raise exception 'that contest was cancelled' using errcode = '22023';
  end if;

  -- The figures themselves. Bounded here so the refusal is a sentence rather
  -- than a numeric overflow, which is what the column would give.
  if v_gmv < 0 then
    raise exception 'a GMV figure cannot be less than zero' using errcode = '22023';
  end if;
  if v_gmv > 100000000 then
    raise exception 'a GMV figure of % looks like a typo', v_gmv using errcode = '22023';
  end if;
  if v_count < 0 then
    raise exception 'a video count cannot be less than zero' using errcode = '22023';
  end if;
  if v_count > 1000 then
    raise exception 'a video count of % looks like a typo', v_count using errcode = '22023';
  end if;

  /*
   * ONE CLAIM WAITING AT A TIME. The unique index is the guarantee; this is the
   * sentence, because a duplicate key error is not one. Two overlapping claims
   * cannot both be reviewed honestly: they describe the same videos.
   */
  if exists (
    select 1 from public.contest_progress_updates u
    where u.entry_id = p_entry_id and u.status = 'pending'
  ) then
    raise exception
      'your last update is still with the team, so wait for them to confirm it before sending another'
      using errcode = '55006';
  end if;

  /*
   * THE HIGHEST COUNT EVER SUBMITTED ON THIS ENTRY, whatever became of it. A
   * rejected claim still counts here, deliberately: the videos filed against it
   * exist and were reviewed, and re-asking for them would file them twice.
   */
  select coalesce(max(u.video_count), 0) into v_prev
  from public.contest_progress_updates u
  where u.entry_id = p_entry_id;

  if v_count < v_prev then
    raise exception
      'you have already told us about % video(s), so this update cannot say %, videos cannot be taken back',
      v_prev, v_count
      using errcode = '22023';
  end if;

  v_new := v_count - v_prev;

  if jsonb_typeof(v_videos) <> 'array' then
    raise exception 'the new videos have to arrive as a list' using errcode = '22023';
  end if;

  select count(*), count(distinct lower(trim(coalesce(v.value->>'video_url', ''))))
  into v_given, v_distinct
  from jsonb_array_elements(v_videos) v;

  -- Both numbers named, because "wrong number of videos" on a form that just
  -- built itself from the count the creator typed is not actionable.
  if v_given <> v_new then
    raise exception
      'this update adds % video(s), so we need % link(s) and ad code(s), not %',
      v_new, v_new, v_given
      using errcode = '22023';
  end if;

  if v_given <> v_distinct then
    raise exception 'the same link is in that list twice' using errcode = '22023';
  end if;

  insert into public.contest_progress_updates (entry_id, creator_id, gmv, video_count)
  -- creator_id comes from the ENTRY, which was matched on auth's actor, and
  -- never from the request. status and the decision stamp are not written here
  -- at all: a claim is pending by default and only staff can move it.
  values (v_entry.id, v_entry.creator_id, v_gmv, v_count)
  returning * into v_row;

  for v_video in select v.value from jsonb_array_elements(v_videos) v loop
    v_url  := nullif(trim(coalesce(v_video->>'video_url', '')), '');
    v_code := nullif(trim(coalesce(v_video->>'ad_code', '')), '');

    if v_url is null or v_url !~* '^https://' then
      raise exception 'every new video needs a link that starts with https://'
        using errcode = '22023';
    end if;
    if length(v_url) > 2048 then
      raise exception 'that link is too long to be a video link' using errcode = '22023';
    end if;
    if v_code is null or length(v_code) < 3 then
      raise exception 'every new video needs its ad code' using errcode = '22023';
    end if;

    -- The unique index on (entry_id, video_url) would catch this as a duplicate
    -- key, which is a true refusal wearing an unreadable message.
    if exists (
      select 1 from public.contest_submissions s
      where s.entry_id = v_entry.id and s.video_url = v_url
    ) then
      raise exception 'you have already posted that link on this contest'
        using errcode = '23505';
    end if;

    insert into public.contest_submissions (
      entry_id, contest_id, creator_id, brand_id, creator_handle, creator_name,
      video_url, ad_code, ad_authorized, thumbnail_url, video_title, video_author,
      embed_id, progress_update_id
    )
    values (
      v_entry.id, v_entry.contest_id, v_entry.creator_id, v_entry.brand_id,
      v_entry.creator_handle, v_entry.creator_name,
      v_url, v_code,
      coalesce((v_video->>'ad_authorized')::boolean, false),
      nullif(trim(coalesce(v_video->>'thumbnail_url', '')), ''),
      nullif(trim(coalesce(v_video->>'video_title', '')), ''),
      nullif(trim(coalesce(v_video->>'video_author', '')), ''),
      nullif(trim(coalesce(v_video->>'embed_id', '')), ''),
      v_row.id
    );
  end loop;

  -- Their own history, which they can read. The figures are not repeated into
  -- the note: the update row itself is selectable by them and is where the
  -- numbers live.
  insert into public.contest_entry_events (entry_id, creator_id, kind, note, actor_id)
  values (v_entry.id, v_entry.creator_id, 'progress_submitted', null, v_actor.id);

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'contest_progress.submitted',
    'contest_progress', v_row.id, v_actor.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand_id', v_entry.brand_id,
      'contest', v_contest.name,
      'contest_id', v_contest.id,
      'entry_id', v_entry.id,
      'creator', v_entry.creator_handle,
      'gmv', v_row.gmv,
      'video_count', v_row.video_count,
      'previous_video_count', v_prev,
      'videos_added', v_new,
      'currency', v_entry.currency
    ))
  );

  return to_jsonb(v_row) || jsonb_build_object('videos_added', v_new);
end;
$$;

comment on function public.submit_contest_progress(uuid, uuid, numeric, integer, jsonb) is
  'A creator says what they have achieved so far on their own entry: a cumulative GMV figure, a cumulative video count that may never go down, and exactly the videos that are new since last time. Writes a PENDING claim. It takes no target, no reward and no status, so there is nothing here that could write one.';

revoke all on function public.submit_contest_progress(uuid, uuid, numeric, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_contest_progress(uuid, uuid, numeric, integer, jsonb)
  to service_role;

-- ============================================================================
-- 14. review_contest_progress, the confirmation that makes a figure real
-- ============================================================================
/*
 * NOTHING COUNTS UNTIL THIS RUNS. A creator typing their own GMV is a creator
 * typing their own payslip, so the claim sits at `pending` until a member of
 * staff looks at the videos and the seller centre and says yes.
 *
 * ONE DECISION PER UPDATE, EVEN IF TWO ADMINS ACT AT THE SAME SECOND. The row is
 * taken FOR UPDATE before anything is read from it, so the second transaction
 * blocks until the first commits and then sees the moved status and refuses. The
 * `status = pending` test alone would not do it: both would have read `pending`
 * before either wrote.
 *
 * IT DOES NOT TOUCH THE VIDEOS. Contest videos are reviewed ONE BY ONE through
 * review_contest_content, decided by Rashid on 2026-08-13, so confirming a count
 * of six is not a decision about six videos and must not silently become one.
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
      'message', v_message
    ))
  );

  return to_jsonb(v_row);
end;
$$;

comment on function public.review_contest_progress(uuid, uuid, public.contest_progress_status, text) is
  'Staff confirm or refuse one claimed set of figures. Refuses a second decision on the same update, including from two admins at once, because the row is locked before its status is read. Does not touch the videos: those are reviewed one by one through review_contest_content.';

revoke all on function public.review_contest_progress(
  uuid, uuid, public.contest_progress_status, text
) from public, anon, authenticated;
grant execute on function public.review_contest_progress(
  uuid, uuid, public.contest_progress_status, text
) to service_role;

-- ============================================================================
-- 15. The confirmed totals, which are the only totals
-- ============================================================================
/*
 * ONE ROW PER ENTRY, BUILT FROM CONFIRMED UPDATES ONLY. Anything that pays
 * money, draws a progress bar or decides a reward reads THIS and never
 * contest_progress_updates directly, because an unconfirmed figure is not a
 * total, it is a claim.
 *
 * THE LATEST CONFIRMED ROW, NOT THE SUM OF THEM. The figures are cumulative
 * totals, so adding two confirmed updates together would double count a creator
 * who reported twice. That is the single arithmetic error this table can cause
 * and it is prevented here, once, rather than in every caller.
 *
 * SAFE TO SHARE WITH CREATORS, and this is the same property that makes
 * job_progress and contest_entry_progress the only shared views in the product:
 * the grouping key is an ENTRY, which belongs to exactly one person, so a
 * creator's count over their own rows is COMPLETE rather than silently narrowed.
 * There is no is_staff() gate for that reason and only that reason. A view keyed
 * to a CONTEST over these same tables would hand a creator their own row and let
 * the screen render it as the contest's total, which is what
 * 20260811230000_brand_rollups.sql:11-19 forbids.
 *
 * security_invoker, so the tables underneath still decide who sees what.
 */
create view public.contest_entry_confirmed_totals
with (security_invoker = true) as
select
  e.id         as entry_id,
  e.creator_id,
  e.contest_id,
  e.brand_id,
  coalesce(c.gmv, 0)::numeric(14, 2)  as confirmed_gmv,
  coalesce(c.video_count, 0)::int     as confirmed_video_count,
  c.confirmed_at                      as confirmed_at,
  coalesce(p.pending, 0)::int         as claims_waiting
from public.contest_entries e
left join lateral (
  select u.gmv, u.video_count, u.confirmed_at
  from public.contest_progress_updates u
  where u.entry_id = e.id and u.status = 'confirmed'
  -- id breaks a tie on created_at, so the answer is one row rather than
  -- whichever of two the planner reached first.
  order by u.created_at desc, u.id desc
  limit 1
) c on true
left join lateral (
  select count(*) as pending
  from public.contest_progress_updates u
  where u.entry_id = e.id and u.status = 'pending'
) p on true
where e.status = 'approved';

comment on view public.contest_entry_confirmed_totals is
  'What one entrant has actually achieved on one contest entry, built ONLY from staff confirmed progress updates, and taken from the LATEST confirmed one because the figures are cumulative rather than incremental. Money and rewards read this and never the raw claims. security_invoker, and keyed to an entry, which belongs to exactly one person.';

grant select on public.contest_entry_confirmed_totals to authenticated;
grant all privileges on table public.contest_entry_confirmed_totals to service_role;

-- ============================================================================
-- 16. THE STANDING, and everything it is allowed to say
-- ============================================================================
/*
 * "2nd closest of 5 to the GMV target." That sentence, and nothing else.
 *
 * THIS AMENDS DECISION D7 AND RULE N1, deliberately, and Rashid confirmed it on
 * 2026-08-13. D7 said no creator ever sees anything about another entrant, and
 * N1 said no creator reachable surface returns a count of entrants in any form.
 * A creator may now learn how far along they are AGAINST THE FIELD. They may
 * never learn a handle, a name, or another entrant's figures, and that half of
 * D7 is untouched and is the reason this is a function rather than a view.
 *
 * WHY A SECURITY DEFINER FUNCTION AND NOT A VIEW. A ranking is computed across
 * every entrant. Under security_invoker a creator would rank themselves against
 * the only row they can read, get "1 of 1" with no error at all, and the screen
 * would render it as the standing. That is the exact failure
 * 20260811230000_brand_rollups.sql:11-19 describes. Under a definer function the
 * ranking is computed over the whole field and then FILTERED DOWN TO THE
 * CALLER'S OWN ROW before it leaves, which is the only shape that is both true
 * and safe.
 *
 * IT TAKES NO USER ID. It reads auth.uid() itself. A version that accepted one
 * would be a standings oracle over every other creator the moment somebody
 * guessed a uuid, which is the same trap contest_excludes_caller was split off
 * contest_excludes to avoid.
 *
 * ------------------------------------------------------------------------
 * WHAT SOMEBODY CAN LEARN BY CALLING THIS REPEATEDLY. PostgREST exposes every
 * executable function in an exposed schema, so this IS a public endpoint to any
 * signed in creator and has to be reasoned about as one rather than as the
 * private half of a screen.
 *
 * 1. It answers about ONE contest and only if the caller has an APPROVED entry
 *    in it. Guessing a contest id gets zero rows, which is the same answer as
 *    guessing a contest that does not exist. So it is not a discovery tool.
 *
 * 2. It returns no identifier of any kind. No entry id, no creator id, no
 *    handle, no other entrant's gmv or video count. Every number it returns is
 *    either the caller's own or an aggregate over the field.
 *
 * 3. It returns the entrant COUNT, which N1 used to forbid. Called repeatedly,
 *    that reveals the shape of the field over time: how many people are in, and
 *    when somebody new joins. This is the amendment, made on purpose, and it is
 *    the price of the sentence Rashid asked for. It names nobody.
 *
 * 4. THE RANK IS A COMPARISON, AND A COMPARISON LEAKS AN INEQUALITY. On a
 *    contest with two entrants, "you are 2nd" says the other person's confirmed
 *    GMV is at or above the caller's, and "you are 1st" says it is at or below.
 *    Repeating that while moving their own figure would binary search the other
 *    person's number. It is bounded rather than open, and the bound is the whole
 *    reason this is acceptable: the caller's own figure only moves when A MEMBER
 *    OF STAFF CONFIRMS IT, one claim at a time, one pending claim per entry, so
 *    every step of that search costs a human decision and appears in the queue
 *    as an obviously strange pattern. No figure is ever returned, only an
 *    ordering, and the ordering is over confirmed totals that lag reality.
 *
 * 5. It is STABLE and reads nothing it does not return an aggregate of. It
 *    writes nothing, so it cannot be used to mark, touch or lock another
 *    entrant's rows.
 *
 * If that trade is ever reopened, the lever is here: refuse to answer below a
 * minimum number of entrants. It is deliberately NOT applied today, because a
 * contest with three entrants is the normal case at this size and the standing
 * would then be missing exactly when Rashid demoed it.
 * ------------------------------------------------------------------------
 *
 * Ties share a place, through rank() rather than row_number(): two creators on
 * the same confirmed GMV are both 2nd, and the next is 4th. row_number() would
 * have invented an order between two people who are level, which is both untrue
 * and a fact about somebody else.
 *
 * It reads contest_progress_updates directly rather than through
 * contest_entry_confirmed_totals. That view is security_invoker, and inside a
 * definer function the invoker is the function's owner, so it would work by an
 * accident of whose rights are in force. A body that says what it reads is worth
 * the eight extra lines.
 */
create or replace function public.my_contest_standing(p_contest_id uuid)
returns table (
  entrants integer,
  confirmed_gmv numeric,
  confirmed_video_count integer,
  gmv_place integer,
  video_place integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select e.id as entry_id
    from public.contest_entries e
    where e.contest_id = p_contest_id
      and e.creator_id = (select auth.uid())
      and e.status = 'approved'
    limit 1
  ),
  field as (
    select e.id as entry_id,
           coalesce(c.gmv, 0)         as gmv,
           coalesce(c.video_count, 0) as videos
    from public.contest_entries e
    left join lateral (
      select u.gmv, u.video_count
      from public.contest_progress_updates u
      where u.entry_id = e.id and u.status = 'confirmed'
      order by u.created_at desc, u.id desc
      limit 1
    ) c on true
    where e.contest_id = p_contest_id and e.status = 'approved'
  ),
  ranked as (
    select f.entry_id,
           f.gmv,
           f.videos,
           count(*) over ()                    as entrants,
           rank() over (order by f.gmv desc)    as gmv_place,
           rank() over (order by f.videos desc) as video_place
    from field f
  )
  -- The join is the filter, and it is the last thing that happens: the ranking is
  -- computed over everybody and exactly one row leaves.
  select r.entrants::integer,
         r.gmv::numeric(14, 2),
         r.videos::integer,
         r.gmv_place::integer,
         r.video_place::integer
  from ranked r
  join me m on m.entry_id = r.entry_id;
$$;

comment on function public.my_contest_standing(uuid) is
  'The CALLER''s own position in one contest they are approved in: their confirmed GMV and video count, how many entrants there are, and their place on each measure. Takes no user id and reads auth.uid() itself. Returns no identifier and no other entrant''s figures. Amends decision D7 and rule N1 to exactly this much: read the block above it before widening anything.';

-- The one function in this file that `authenticated` may call, because the
-- creator screen calls it directly. Everything else goes through an Edge
-- Function as service_role.
revoke all on function public.my_contest_standing(uuid) from public, anon;
grant execute on function public.my_contest_standing(uuid) to authenticated, service_role;
