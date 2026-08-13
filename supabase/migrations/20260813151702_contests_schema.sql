/*
 * Contests: the whole shape of them, and nothing that writes to them.
 *
 * A contest is an ongoing event that belongs to one brand and that creators ask
 * to be part of. An admin sets it up on the brand, a creator taps Apply, and
 * both sides get a real dashboard: the admin sees who applied and what they
 * were promised, the creator sees what they entered, what they owe and what it
 * pays.
 *
 * THIS FILE CARRIES STRUCTURE ONLY. The three enums, the eleven tables, every
 * check and index, row security, every policy, every grant, the realtime
 * membership, the three views, and the three shared definition functions the
 * policies quote. The eighteen write functions live in the companion migration
 * that runs immediately after this one; nothing here can write a row, and until
 * that file lands every one of these tables is readable and inert, which is the
 * safe half to apply first.
 *
 * THREE DECISIONS DECIDE THE WHOLE SHAPE, and they are all about who can read
 * what, because column level SELECT grants cannot separate staff from creators
 * when both are the Postgres `authenticated` role:
 *
 * 1. THE BUDGET IS NOT ON `contests`. It is in `contest_commercials`, a
 *    staff-only sibling, for exactly the reason `brand_commercials` was split
 *    off `brands` at 20260730170000:6-13. A creator reads `contests` on day
 *    one, so a future careless policy on it must not be able to leak money,
 *    and the way to guarantee that is for the money not to be there.
 *
 * 2. THE CREATOR'S OWN TARGET IS NOT ON `contest_entries`, and this one points
 *    the OTHER way. `contest_entry_targets` is the first table in this product
 *    with a creator policy and NO STAFF POLICY AT ALL. Same mechanism, same
 *    sentence, opposite audience: the screen that collects the number promises
 *    nobody else sees it, and a promise a policy does not keep is a lie told on
 *    our own screen.
 *
 * 3. NOBODY EVER READS ANOTHER ENTRANT. There is no leaderboard view, no
 *    standings table, no entrant headcount on anything a creator can select.
 *    A creator counting rows they cannot all see gets a plausible small number
 *    back rather than an error, which is a wrong number that looks like a
 *    working feature (20260811230000:11-19).
 *
 * There is no insert, update or delete policy on any of the eleven tables, on
 * purpose. Every write goes through a security definer function behind an Edge
 * Function that re-checks the caller, exactly like offers and content.
 */

-- ============================================================================
-- 1. Vocabulary
-- ============================================================================

-- Mirrors offer_status exactly, because Rashid's word for this axis is
-- "active or not". Settlement and cancellation are timestamps with an actor,
-- not enum values, so the switch on the form keeps meaning one thing.
create type public.contest_status as enum ('active', 'inactive');

create type public.contest_entry_status as enum (
  'pending',
  'approved',
  'rejected',
  /*
   * The creator changed their mind. Kept rather than deleted, the same reason
   * offer_applications keeps 'withdrawn'. This is the ONLY way a live entry
   * leaves the live set, and only the creator themselves can cause it.
   *
   * There is deliberately no 'removed'. That value existed to record an admin
   * pulling a live entrant out, and Rashid ruled on 2026-08-13 that no such
   * action exists anywhere in the product, which leaves nothing that could
   * ever write it. An enum value nothing can write is a promise an admin
   * screen will eventually try to keep.
   */
  'withdrawn'
);

/*
 * The three shapes "deliverables with rewards" turned out to mean, in one
 * type, so that none of them is a migration later.
 *
 *   fixed      post N videos, get paid X. Time boxed by the contest expiry.
 *   rank       finish Nth by some measure, get paid X.
 *   milestone  reach a threshold on some measure, get paid X.
 *
 * A contest may hold any mixture. Decided by Rashid on 2026-08-12: the admin
 * adds as many deliverable-and-reward rows as they like, and a row is either
 * something you do or a place you finish in.
 *
 * Ruled against jsonb, deliberately. Money in this product is numeric(12,2)
 * with a >= 0 check and a currency with a ^[A-Z]{3}$ check, and none of that is
 * expressible per element inside jsonb, while contest_totals has to sum
 * committed rewards per currency.
 */
create type public.contest_deliverable_kind as enum ('fixed', 'rank', 'milestone');

-- ============================================================================
-- 2. contests
-- ============================================================================

create table public.contests (
  id uuid primary key default gen_random_uuid(),

  -- Cascades, the same as offers. A contest for a brand that no longer exists
  -- means nothing, and audit_log keeps the record of what it was. delete_brand
  -- does not exist; a brand is retired, never deleted.
  brand_id uuid not null references public.brands (id) on delete cascade,

  name text not null check (length(trim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 4000),

  /*
   * HOW THIS CONTEST IS JUDGED, in the admin's own words. Decided by Rashid on
   * 2026-08-13.
   *
   * Named for what it is rather than for the screen it appears on. It is the
   * BASIS a placing is decided on, so it stays right if the creator surface is
   * redrawn.
   *
   * Creator readable, like every other column on this table, and deliberately
   * NOT commercial: it is one of exactly three sources of motivation on a live
   * contest, so it belongs where a creator can read it in the same select that
   * draws the contest.
   *
   * Nullable HERE, and required by a function rather than by a constraint. A
   * contest carrying any ACTIVE deliverable of the `rank` kind must have it,
   * because that sentence is the only thing standing in for a scoreboard and a
   * placing with no stated basis is the one thing that would make a contest
   * feel arbitrary. A CHECK constraint cannot see another table, so the
   * requirement is enforced in save_contest AND in save_contest_deliverable,
   * both directions, since either one could create the illegal combination.
   *
   * Trimmed length in the idiom cancel_message uses, not the raw <= idiom
   * description uses, because a sentence made of spaces is exactly the value a
   * form leaves behind when somebody tabs through the field.
   */
  judging_basis text check (
    judging_basis is null or length(trim(judging_basis)) between 1 and 600
  ),

  /*
   * The content brief. Staff write it, every entrant clicks it, so it is a
   * one to many surface and gets the same check content_submissions.video_url
   * carries: https only, bounded, no javascript: or data: URL can ever reach a
   * creator's screen through it.
   */
  brief_url text check (
    brief_url is null
    or (brief_url ~* '^https://' and length(brief_url) between 12 and 2048)
  ),

  /*
   * Optional banner artwork, uploaded by a staff member inside the contest
   * setup form. Same URL check as brief_url and for the same reason: it is a
   * string an admin supplies that every entrant's browser then fetches.
   *
   * It sits HERE, on contests, and NOT on contest_commercials, because a
   * banner is not commercial information. contest_commercials exists for one
   * job, keeping the total budget out of a creator read path; the artwork is
   * the exact opposite of that. Putting it behind the staff-only sibling would
   * force a second, staff-only read on every creator surface that draws a
   * contest, and would end with somebody widening a policy on the budget table
   * to make a picture load.
   *
   * Nullable, and NULL is the normal case rather than a fallback: the database
   * is empty and the first contests will have none.
   *
   * There is deliberately no aspect ratio, no width and no height column. The
   * crop is OURS and it is one crop everywhere, 3:1 inside the reading column.
   * A stored ratio would be a second place for that fact to live and the first
   * thing somebody would widen for one contest.
   */
  banner_url text check (
    banner_url is null
    or (banner_url ~* '^https://' and length(banner_url) between 12 and 2048)
  ),

  status public.contest_status not null default 'inactive',

  -- Defaults to the safe side, exactly as offers.needs_application does.
  needs_admin_approval boolean not null default true,

  /*
   * timestamptz, and the admin sets a date AND a time. Wurx targets US and UK
   * creators while the team sits in one place, so a date-only expiry would
   * close at three different moments for three people and the client and the
   * server would disagree about who got in.
   */
  opens_at timestamptz not null default now(),
  expires_at timestamptz not null,

  /*
   * THE ZONE THE DEADLINE WAS SET IN.
   *
   * Every creator facing deadline has to name its timezone, and a timestamptz
   * cannot serve that on its own: it stores one instant in UTC and throws away
   * the offset it was written with, so "31 Aug 23:59 Europe/London" and
   * "31 Aug 15:59 America/Los_Angeles" are the SAME VALUE and nothing in the
   * row can tell them apart afterwards.
   *
   * An IANA zone name, not an offset and not an abbreviation. An offset is
   * wrong twice a year: this contest closes at 11:59pm BST in August and
   * 11:59pm GMT in December, and the stored zone is 'Europe/London' both
   * times. The abbreviation is DERIVED at render time from the instant plus
   * this zone, which is the only way it can be right on both sides of a clock
   * change.
   *
   * ONE zone per contest, applying to opens_at as well as expires_at. Two
   * columns would be two things that can disagree, and no admin has ever
   * wanted a contest that opens in London and closes in Los Angeles.
   *
   * NOT nullable and no silent default beyond this one: a contest whose
   * deadline names no zone is exactly the support call this column was added
   * against, so there must be no way to write one. The value is validated
   * against pg_timezone_names inside save_contest rather than in a check
   * constraint, because that catalogue lookup is not immutable and Postgres
   * will not accept it in a CHECK.
   */
  expires_at_timezone text not null default 'Europe/London'
    check (length(trim(expires_at_timezone)) between 3 and 64),

  /*
   * The single currency dimension of the whole contest. Every deliverable
   * reward and the total budget are quoted in it. Nothing in the product may
   * ever add across two of these, and contest_commercials.total_budget
   * deliberately has no currency of its own: one column cannot disagree with
   * another column that does not exist.
   */
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  -- Settlement and cancellation are terminal, have an actor, and have a time.
  -- Two values in a status enum could not carry either.
  settled_at timestamptz,
  settled_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  /*
   * MESSAGE, not reason. Ruled 2026-08-13.
   *
   * Every column on this table is creator facing, and the cancel screen labels
   * this field as what the entrants will read. A field called "reason" invites
   * somebody at eleven at night to type "client pulled the budget" into a box
   * that two creators then open. The column name is the last thing standing
   * between an internal note and the person it is about, so it says what it is.
   *
   * The exclusion table keeps its own "reason" column, and correctly: that one
   * is staff only and nobody outside the team can ever read it.
   */
  cancel_message text check (
    cancel_message is null or length(trim(cancel_message)) between 1 and 500
  ),

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (expires_at > opens_at),
  check (settled_at is null or cancelled_at is null),
  check ((settled_at is null) = (settled_by is null)),
  check ((cancelled_at is null) = (cancelled_by is null)),

  -- Lets contest_products carry a composite foreign key, so a product from
  -- another brand cannot be attached even by a direct service-key write.
  unique (id, brand_id)
);

comment on table public.contests is
  'A brand''s contest. Every column here is creator facing by design. The total budget is deliberately NOT here: it is in contest_commercials, staff only.';

/*
 * INDEXES, and they are not optional. The default sort on every contest
 * surface is the expiry column, and the row security predicate calls two
 * security definer functions per candidate row.
 *
 * Neither function can be inlined, because Postgres never inlines a definer
 * function, so an index on expires_at cannot be substituted for them however
 * the predicate is spelled. What makes them affordable is that both are single
 * primary key probes AND that the candidate set is bounded before the policy
 * runs: equality on uuid is leakproof, so a user qual of brand_id = eq.<id> or
 * id = eq.<id> is evaluated ahead of the policy quals and contests_brand_idx
 * serves it. Every creator side contest read therefore carries a brand filter
 * or an id filter, or is paged.
 */

-- Every admin surface and every creator hub tab reads one brand's contests,
-- newest deadline order. Leading column is the FK, which we index anyway, and
-- the second column serves the sort inside it.
create index contests_brand_idx on public.contests (brand_id, expires_at);

-- "Closing soonest", the default order on the creator contests screen, over
-- the only rows that can appear on it. Partial, so it stays small for ever:
-- settled and cancelled contests leave the index rather than accumulating in
-- it, and a year of dead contests costs nothing.
create index contests_soonest_idx on public.contests (expires_at)
  where status = 'active' and settled_at is null and cancelled_at is null;

/*
 * WHERE THE BANNER FILE LIVES, AND WHY THERE IS NO STORAGE MIGRATION HERE.
 *
 * The banner is uploaded into the EXISTING `brand-assets` bucket, migrated at
 * 20260730170100_brand_assets_storage.sql, with every property that file
 * already set: public read, staff-only write through is_staff(), a 2 MB size
 * limit, and image/png, image/jpeg and image/webp only. No SVG, deliberately,
 * because an SVG is a script host.
 *
 * A separate `contest-banners` bucket was considered and rejected. It would
 * have carried the identical four policies, the identical size limit and the
 * identical MIME list, so it buys one thing only, a second place for those five
 * facts to be kept in step. Files go under a `contests/<contest_id>` folder,
 * the same shape brand logos and product images already use.
 *
 * THE BUCKET IS PUBLICLY READABLE, so nothing commercial may appear in the
 * artwork: no total budget, no internal note, no client name that is not
 * already public, no margin, no rate card, no screenshot of an admin screen.
 * That is a rule about what staff put in a picture, which no check constraint
 * can enforce, so it is written into the upload control's helper text as well
 * as here.
 */

-- ============================================================================
-- 3. contest_commercials, staff only
-- ============================================================================

create table public.contest_commercials (
  -- Primary key as well as foreign key: there is no such thing as two budgets
  -- for one contest. Same shape as brand_commercials.
  contest_id uuid primary key references public.contests (id) on delete cascade,

  /*
   * Denominated in contests.currency. No currency column here on purpose: a
   * second currency column is a second thing that can disagree, and
   * brand_commercials.currency versus offers.currency is already the one place
   * in the product where money is added across two.
   *
   * And no budget_used column, anywhere. brand_commercials.budget_used is a
   * maintained total with one writer, and scripts/reconcile-budgets.mjs exists
   * only because a hand cleanup made it drift. Every contest money figure is
   * derived by summing the frozen per entrant rows through contest_totals, and
   * the checks that need a number inside a transaction take the contest row
   * `for update` and sum under that lock, which cannot drift.
   */
  total_budget numeric(14, 2) check (total_budget is null or total_budget >= 0),

  -- Internal only. Never rendered on any creator surface.
  internal_note text check (internal_note is null or length(internal_note) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.contest_commercials is
  'The contest''s total budget and internal note. Staff only, and deliberately NOT part of the contests table, so a creator read path cannot reach it by accident. There is NO creator policy here and there must never be one.';

-- ============================================================================
-- 4. contest_deliverables, the definition
-- ============================================================================

create table public.contest_deliverables (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,

  kind public.contest_deliverable_kind not null,

  /*
   * THE ADMIN TYPES THIS, EVERY TIME. Decided by Rashid on 2026-08-13, against
   * the recommendation, which had been to generate a title from the row's own
   * numbers and let him override it.
   *
   * What the answer settles is that NOTHING generates a value for it, ever. Not
   * the client, not the Edge Function, not a database default, not a fallback
   * at render time. The trimmed length check is therefore load bearing rather
   * than cosmetic: it is what refuses a row whose title is spaces, which is
   * what a form leaves behind when somebody tabs through the field.
   */
  title text not null check (length(trim(title)) between 1 and 160),
  detail text check (detail is null or length(detail) <= 1000),

  -- kind = 'fixed'
  video_count integer check (video_count is null or video_count between 1 and 1000),

  -- kind = 'rank'. 1 is first place.
  rank_position integer check (rank_position is null or rank_position between 1 and 1000),

  -- kind = 'milestone'. `metric` is a label, not a computed field: nothing in
  -- this product measures GMV yet.
  metric text check (metric is null or length(trim(metric)) between 1 and 40),
  threshold numeric(14, 2) check (threshold is null or threshold >= 0),

  reward_amount numeric(12, 2) check (reward_amount is null or reward_amount >= 0),

  sort_order integer not null default 0,

  -- Soft disable, never delete, because entrants have snapshotted these rows.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (kind <> 'fixed' or video_count is not null),
  check (kind <> 'rank' or rank_position is not null),
  check (kind <> 'milestone' or (metric is not null and threshold is not null))
);

-- Two people cannot both be second place.
create unique index contest_deliverables_rank_idx
  on public.contest_deliverables (contest_id, rank_position)
  where kind = 'rank' and is_active;

create index contest_deliverables_contest_idx
  on public.contest_deliverables (contest_id, sort_order, created_at);

comment on table public.contest_deliverables is
  'What a contest asks for and what each thing pays. Three kinds in one table so a fixed job, ranked prizes and a mixed list all fit without a migration.';

-- ============================================================================
-- 5. contest_products, the dropdown, enforced
-- ============================================================================

-- brand_products.id is already the primary key, so this is free, and it is what
-- makes the composite foreign key below legal. It has to be added BEFORE the
-- table that references it, which is the one place this file departs from the
-- plan's reading order and only because Postgres insists.
alter table public.brand_products add constraint brand_products_id_brand_key
  unique (id, brand_id);

create table public.contest_products (
  contest_id uuid not null references public.contests (id) on delete cascade,

  -- RESTRICT, not cascade. A product cannot be deleted out from under a live
  -- contest. delete_product also gains a human-readable refusal in the
  -- functions migration, but this is the guarantee that holds against a direct
  -- service-key delete, which is exactly the gap delete_offer's function-only
  -- protection leaves.
  product_id uuid not null references public.brand_products (id) on delete restrict,

  brand_id uuid not null references public.brands (id) on delete cascade,

  -- Snapshotted, so deactivating or renaming a product never blanks the brief
  -- an entrant is working to.
  product_name text not null check (length(trim(product_name)) between 1 and 160),
  external_product_id text not null check (length(trim(external_product_id)) between 1 and 64),

  created_at timestamptz not null default now(),

  primary key (contest_id, product_id),

  -- The product must belong to the contest's brand, and the contest must
  -- belong to that same brand. Declarative, not a check somebody can forget.
  foreign key (product_id, brand_id) references public.brand_products (id, brand_id),
  foreign key (contest_id, brand_id) references public.contests (id, brand_id)
);

create index contest_products_product_idx on public.contest_products (product_id);

-- ============================================================================
-- 6. contest_entries
-- ============================================================================

create table public.contest_entries (
  id uuid primary key default gen_random_uuid(),

  contest_id uuid not null references public.contests (id) on delete cascade,

  -- Denormalised from the contest so the admin queue filters by brand without
  -- a join, and so a row still says which brand it belonged to. Same reason
  -- offer_applications.brand_id exists.
  brand_id uuid not null references public.brands (id) on delete cascade,

  creator_id uuid not null references public.profiles (id) on delete cascade,

  -- Who they were when they entered. Snapshotted, never joined from profiles,
  -- so the queue still reads correctly after a rename or a closed account and
  -- search stays one trigram index on one table.
  creator_handle text,
  creator_name text,
  creator_email text,

  status public.contest_entry_status not null default 'pending',

  -- True when the contest was on auto approve at the moment they entered. The
  -- flag on the contest can be changed afterwards; this cannot.
  auto_approved boolean not null default false,

  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  /*
   * Frozen at approval, exactly as committed_amount and committed_video_count
   * are on a job. This is the sum of the FIXED deliverable rewards only.
   * Ranked and milestone rewards are contingent and commit at settlement into
   * contest_awards, because at approval nobody knows who won.
   */
  committed_amount numeric(12, 2) check (committed_amount is null or committed_amount >= 0),
  committed_video_count integer
    check (committed_video_count is null or committed_video_count > 0),

  note text check (note is null or length(note) <= 1000),

  -- There is no self_target column HERE, and there must never be one. The
  -- creator's own private target lives in contest_entry_targets below, because
  -- staff can select every column of this table and the target is the one
  -- number in the feature staff must not be able to read.

  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),

  -- There is no removed_reason column. It existed to carry the reason an admin
  -- pulled a live entrant out, and that action was cut on 2026-08-13, so the
  -- column has no writer. A reason field with nothing to explain is how a
  -- removal action gets rebuilt by somebody who finds it.

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/*
 * One live entry per creator per contest. Partial, not a plain constraint, and
 * this is what lets somebody rejected in March enter again in June, or somebody
 * who withdrew change their mind. What must not happen is two open entries.
 * Copied verbatim in shape from offer_applications_one_open_idx.
 */
create unique index contest_entries_one_open_idx
  on public.contest_entries (contest_id, creator_id)
  where status in ('pending', 'approved');

create index contest_entries_queue_idx on public.contest_entries (status, created_at desc);
create index contest_entries_contest_idx on public.contest_entries (contest_id, status);
create index contest_entries_brand_idx on public.contest_entries (brand_id, status);
create index contest_entries_creator_idx on public.contest_entries (creator_id, created_at desc);
create index contest_entries_handle_trgm_idx
  on public.contest_entries using gin (creator_handle extensions.gin_trgm_ops);

/*
 * Note what is NOT on this row: no rank, no rank-out-of-N, no entrant count, no
 * budget-derived figure. A rank of 3 of 14 is a fact about thirteen other
 * people delivered through a row the creator is allowed to read, and
 * 20260731093000_offer_applications.sql:126-127 says "No policy lets anybody
 * see what another creator asked for, or what they were paid." That sentence
 * stays true, and since 2026-08-13 it is a ruling rather than a preference.
 */

-- ============================================================================
-- 7. contest_entry_targets, the creator's own private number
-- ============================================================================
/*
 * The self set target. One number per entry, set by the creator, meaning "I am
 * going for six approved videos by the deadline". It exists because with every
 * fact about other entrants removed, this is what is left to compete against.
 *
 * ITS OWN TABLE, and this is the whole point of it.
 *
 * contest_entries carries contest_entries_select_staff, an unrestricted
 * is_staff() SELECT over every column, and a column level SELECT grant cannot
 * take one column back off staff while leaving it with creators, because both
 * are the Postgres `authenticated` role. That is the same sentence as
 * brand_commercials at 20260730170000:6-13; only the direction is reversed. So
 * the target goes in a sibling with ONE policy on it, the creator's own, and NO
 * staff policy of any kind.
 *
 * WHY STAFF MUST NOT READ IT, since it is unusual in this product. The screen
 * that asks for it says, in words, "Nobody else sees it and you can change it
 * any time." If an admin can pull it up on the entries queue that sentence is a
 * lie told by us, on our own screen, to the person whose transparency is the
 * product. It is also worthless the moment it is visible: a private commitment
 * a creator will be judged on is a quota, and they would set it low or not set
 * it at all. There is no admin question that needs this number.
 */
create table public.contest_entry_targets (
  -- Primary key as well as foreign key: one target per entry, and changing it
  -- is an update rather than a second row, so there is no history to leak.
  entry_id uuid primary key references public.contest_entries (id) on delete cascade,

  -- Denormalised so the read policy never has to reach into contest_entries,
  -- which is the table the policy is protecting this row FROM.
  creator_id uuid not null references public.profiles (id) on delete cascade,

  -- A count of approved videos, the only measure this product can truthfully
  -- track today. Same bound as contest_deliverables.video_count, so a target
  -- can never be a number the contest could not accept.
  target integer not null check (target between 1 and 1000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The creator's own read of "all my targets" across contests, for the one
-- query that draws them on the creator home.
create index contest_entry_targets_creator_idx
  on public.contest_entry_targets (creator_id);

comment on table public.contest_entry_targets is
  'A creator''s own private target for one contest entry. There is NO staff policy on this table and there must never be one: the screen that collects it promises nobody else sees it. It appears in no view, in no rollup, in no audit_log detail and in no Edge Function response that is not returning it to the person who set it.';

-- ============================================================================
-- 8. contest_entry_terms, the frozen promise
-- ============================================================================

create table public.contest_entry_terms (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.contest_entries (id) on delete cascade,

  -- SET NULL, not cascade. Retiring or removing a deliverable must never blank
  -- what somebody already agreed to, so every field below is copied, not
  -- joined, and this pointer is a convenience only.
  deliverable_id uuid references public.contest_deliverables (id) on delete set null,

  kind public.contest_deliverable_kind not null,
  title text not null check (length(trim(title)) between 1 and 160),
  detail text check (detail is null or length(detail) <= 1000),
  video_count integer check (video_count is null or video_count between 1 and 1000),
  rank_position integer check (rank_position is null or rank_position between 1 and 1000),
  metric text check (metric is null or length(trim(metric)) between 1 and 40),
  threshold numeric(14, 2) check (threshold is null or threshold >= 0),
  reward_amount numeric(12, 2) check (reward_amount is null or reward_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),

  created_at timestamptz not null default now()
);

create index contest_entry_terms_entry_idx on public.contest_entry_terms (entry_id);

comment on table public.contest_entry_terms is
  'What one entrant was promised, copied at the moment they were approved and never read live from the contest again. Rashid, 2026-08-11: once we have approved, an admin should never be able to edit the number of deliverables.';

-- ============================================================================
-- 9. contest_exclusions, staff only
-- ============================================================================

create table public.contest_exclusions (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,

  /*
   * Three ways to name somebody, and only ONE of them is durable.
   *
   *   user_id  the only key that cannot be changed by the person being barred.
   *   email    profiles.email is not in the column-level UPDATE grant, but it
   *            IS synced from auth.users by on_auth_user_email_changed
   *            (20260729145631:212-232), so a creator CAN change it.
   *   handle   applications.tiktok_handle carries a standing column-level
   *            UPDATE grant to authenticated (20260729153108:107-108) and the
   *            guard trigger there protects only the review columns. A creator
   *            can rename their handle from the browser console.
   *
   * So handle and email exist to close the case where the person has no
   * account yet. save_contest_exclusion resolves them to a user_id the moment
   * it can and PINS it; from then on only the uuid is compared.
   */
  handle text check (handle is null or length(trim(handle)) between 1 and 64),
  email text check (email is null or length(trim(email)) between 3 and 320),
  user_id uuid references public.profiles (id) on delete set null,

  reason text check (reason is null or length(trim(reason)) between 1 and 500),

  -- "Track them differently" without an unbounded row per tap: a counter, not
  -- an entry row. There was no button, so there is no entry to file.
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (handle is not null or email is not null or user_id is not null)
);

create unique index contest_exclusions_user_idx
  on public.contest_exclusions (contest_id, user_id) where user_id is not null;
create unique index contest_exclusions_email_idx
  on public.contest_exclusions (contest_id, lower(email)) where email is not null;
create unique index contest_exclusions_handle_idx
  on public.contest_exclusions (contest_id, lower(handle)) where handle is not null;

-- ============================================================================
-- 10. contest_entry_events, contest_submissions, contest_awards
-- ============================================================================

/*
 * Creator readable history, the counterpart of offer_stage_events. audit_log is
 * staff only, so anything a creator should be able to see about their own entry
 * goes here, with creator_id denormalised so the read policy never has to reach
 * into another table.
 */
create table public.contest_entry_events (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.contest_entries (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (length(trim(kind)) between 3 and 40),
  note text check (note is null or length(note) <= 500),
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index contest_entry_events_entry_idx
  on public.contest_entry_events (entry_id, created_at desc);
create index contest_entry_events_creator_idx
  on public.contest_entry_events (creator_id, created_at desc);

/*
 * Contest deliverables get their OWN submission path. Decided by Rashid on
 * 2026-08-12, and it obliges two things the client side owes: ONE creator route
 * for filing any work, and two review queues that read as one job with a
 * filter. The two tables underneath are an implementation detail and neither
 * side of the product is allowed to see the seam.
 */
create table public.contest_submissions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.contest_entries (id) on delete cascade,
  contest_id uuid not null references public.contests (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  creator_handle text,
  creator_name text,
  video_url text not null
    check (video_url ~* '^https://' and length(video_url) between 12 and 2048),
  ad_code text not null check (length(trim(ad_code)) between 3 and 120),
  ad_authorized boolean not null default false,
  status public.content_status not null default 'submitted',
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  thumbnail_url text,
  video_title text,
  video_author text,
  embed_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The same link twice against one entry is a mis-paste, not two videos.
  unique (entry_id, video_url)
);

create index contest_submissions_entry_idx on public.contest_submissions (entry_id, status);
create index contest_submissions_contest_idx on public.contest_submissions (contest_id, status);
create index contest_submissions_creator_idx on public.contest_submissions (creator_id, created_at desc);

/*
 * Settlement. A SECOND money event with its own moment of truth, because a rank
 * cannot be known at approval. Its own snapshot, its own uniqueness, its own
 * status guard, because this project has no idempotency keys anywhere and a
 * double click on Settle would otherwise pay the pot twice.
 *
 * IT IS A SETTLEMENT OUTCOME TABLE THAT ALSO CARRIES MONEY, and that is the
 * cost of keeping "You placed 5th". Every fact about other entrants is off
 * every creator surface, and the one thing kept is a creator's own placing,
 * because it is their own result and names nobody. But a placing cannot be
 * derived on the creator's screen without a ranking, and a ranking is the exact
 * object that is forbidden to exist. So the placing is a stored fact about ONE
 * entry, written by staff at settlement, and written for EVERY entrant rather
 * than only the ones being paid, or the fifth place finisher has nothing to
 * read.
 *
 * Two shapes of row, and the checks below are what keep them from blurring:
 *
 *   OUTCOME row.  term_id IS NULL, awarded_amount = 0, placement carries their
 *                 place (or NULL on a contest with no ranked deliverable, where
 *                 nobody placed in anything). Exactly ONE per entry, always
 *                 written, and it is also the idempotency guard for the whole
 *                 settlement.
 *   MONEY row.    term_id NOT NULL, awarded_amount > 0, placement NULL. One per
 *                 (entry, term). Only for entrants who won something.
 *
 * Keeping money off the outcome row is what stops brand_contest_totals double
 * counting: an entrant who placed 1st has an outcome row worth 0 and a money
 * row worth the prize, and sum(awarded_amount) is still the prize.
 */
create table public.contest_awards (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  entry_id uuid not null references public.contest_entries (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  term_id uuid references public.contest_entry_terms (id) on delete set null,
  placement integer check (placement is null or placement between 1 and 1000),
  awarded_amount numeric(12, 2) not null check (awarded_amount >= 0),
  awarded_currency text not null check (awarded_currency ~ '^[A-Z]{3}$'),
  note text check (note is null or length(note) <= 500),
  awarded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  -- An outcome row carries no money. Money is always attached to the frozen
  -- term it was promised by, so every payment can be traced to a sentence the
  -- creator agreed to.
  check (term_id is not null or awarded_amount = 0),

  -- A placing is only ever on the outcome row. Two rows carrying a placing for
  -- one entrant is how "you placed 5th" becomes "you placed 5th and 2nd".
  check (placement is null or term_id is null)
);

/*
 * THREE PARTIAL UNIQUE INDEXES, NOT ONE CONSTRAINT, and the difference is the
 * whole double-click guard.
 *
 * The money uniqueness, unchanged in meaning, written as a partial unique INDEX
 * rather than a table constraint because it has to exclude the outcome rows,
 * whose term_id is NULL.
 */
create unique index contest_awards_money_idx
  on public.contest_awards (contest_id, entry_id, term_id)
  where term_id is not null;

/*
 * ONE outcome row per entrant, and this is the double-click guard for
 * settlement as a whole. A plain `unique (contest_id, entry_id, term_id)` would
 * NOT have caught it: Postgres treats NULLs as distinct in a unique constraint
 * by default, so two clicks on Settle would have written two outcome rows per
 * entrant and told nobody.
 */
create unique index contest_awards_outcome_idx
  on public.contest_awards (contest_id, entry_id)
  where term_id is null;

-- Two people cannot both be fifth. The same shape as
-- contest_deliverables_rank_idx, and it is what makes the admin's typed
-- placings a set rather than a list of opinions.
create unique index contest_awards_placement_idx
  on public.contest_awards (contest_id, placement)
  where placement is not null;

create index contest_awards_contest_idx on public.contest_awards (contest_id);
create index contest_awards_entry_idx on public.contest_awards (entry_id);
create index contest_awards_creator_idx on public.contest_awards (creator_id, created_at desc);

-- ============================================================================
-- 11. Touch triggers, on every table that carries updated_at
-- ============================================================================

create trigger contests_touch_updated_at
  before update on public.contests
  for each row execute function public.touch_updated_at();

create trigger contest_commercials_touch_updated_at
  before update on public.contest_commercials
  for each row execute function public.touch_updated_at();

create trigger contest_deliverables_touch_updated_at
  before update on public.contest_deliverables
  for each row execute function public.touch_updated_at();

create trigger contest_entries_touch_updated_at
  before update on public.contest_entries
  for each row execute function public.touch_updated_at();

create trigger contest_entry_targets_touch_updated_at
  before update on public.contest_entry_targets
  for each row execute function public.touch_updated_at();

create trigger contest_exclusions_touch_updated_at
  before update on public.contest_exclusions
  for each row execute function public.touch_updated_at();

create trigger contest_submissions_touch_updated_at
  before update on public.contest_submissions
  for each row execute function public.touch_updated_at();

-- contest_products, contest_entry_terms, contest_entry_events and
-- contest_awards carry created_at only. A frozen promise, a history line and a
-- settled outcome do not get touched, so there is nothing to touch.

-- ============================================================================
-- 12. One index on an old table, which contests are about to make slow
-- ============================================================================
/*
 * useAtRisk counts audit_log rows with `action like '%_denied'` over the last
 * week, on the first screen Rashid opens, and there is no index on `action`
 * today: 20260729162827:59-63 lists all four that exist. Contests add two new
 * denial verbs to that scan. Without this, the admin home gets slower every
 * week that anybody probes a contest.
 */
create index audit_log_action_idx on public.audit_log (action, created_at desc);

-- ============================================================================
-- 13. The shared definitions, which have to exist before the policies quote
--     them
-- ============================================================================
/*
 * These come BEFORE row security below, and only for that reason. A policy
 * cannot reference a function that does not exist yet, and both creator select
 * policies on `contests` call both of these.
 */

/*
 * ONE definition of "open", quoted by the browse policy, by apply_for_contest
 * and by the admin list, so the three cannot drift apart. The precedent is
 * job_is_filmed, extracted for exactly that reason.
 *
 * SECURITY DEFINER, and job_is_filmed is NOT, and the difference matters.
 * job_is_filmed is safe as an invoker function because every one of its callers
 * is already a definer function that has checked who is asking. This one is
 * called from an RLS POLICY BODY, evaluated with the caller's own rights, so as
 * an invoker function it would read `brands` through brands_select_creator and
 * return a DIFFERENT ANSWER to an applicant than to an admin, which defeats the
 * whole point of extracting it. Same reason is_approved_creator() had to be
 * definer.
 */
create or replace function public.contest_is_open(p_contest_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select c.status = 'active'
     and c.settled_at is null
     and c.cancelled_at is null
     and now() >= c.opens_at
     and now() < c.expires_at
     and b.is_active
  from public.contests c
  join public.brands b on b.id = c.brand_id
  where c.id = p_contest_id;
$$;

comment on function public.contest_is_open(uuid) is
  'Whether a contest is taking new entries right now. The single definition, quoted by the browse policy, by apply_for_contest and by the admin list. Says nothing about whether an existing entrant may still work or be paid.';

revoke all on function public.contest_is_open(uuid) from public, anon;
grant execute on function public.contest_is_open(uuid) to authenticated;

/*
 * THE ONE DEFINITION OF EXCLUDED, as two functions with one body, because the
 * two callers need different powers.
 *
 * This is the internal form. It takes the user to test AS AN ARGUMENT, so it
 * can be used to ask about anybody, which is why it is granted to service_role
 * only and to nothing else. Everything else delegates to it.
 *
 * The coalesce on both sides of every comparison is load bearing and is the
 * reason this was worth extracting rather than copying. A creator with no
 * application row has a NULL handle, and `null = 'x'` is NULL rather than
 * false, so an OR chain without the coalesce silently evaluates to NULL and the
 * guard passes for EVERYBODY. That trap is now written once.
 */
create or replace function public.contest_excludes(
  p_contest_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contest_exclusions x
    where x.contest_id = p_contest_id
      and (
        -- The pinned uuid first, and on its own index. This is the resolved
        -- case, which is the normal one, and it is the branch that has to be
        -- cheap because a policy body calls it per row.
        x.user_id = p_user_id
        or (
          -- The unresolved case only. Bounded by the same contest_id, so it
          -- reads at most the handful of rows an admin typed before the
          -- person had an account.
          x.user_id is null
          and exists (
            select 1
            from public.profiles p
            left join lateral (
              select a.tiktok_handle
              from public.applications a
              where a.user_id = p.id
              order by a.created_at desc
              limit 1
            ) h on true
            where p.id = p_user_id
              and (
                lower(coalesce(x.email, '')) = lower(coalesce(p.email, chr(1)))
                or lower(ltrim(coalesce(x.handle, ''), '@'))
                     = lower(ltrim(coalesce(h.tiktok_handle, chr(1)), '@'))
              )
          )
        )
      )
  );
$$;

comment on function public.contest_excludes(uuid, uuid) is
  'Whether the named user is barred from this contest. The body both creator policies and apply_for_contest resolve to, through the caller-only wrapper. Takes a uuid, so it is service_role only and must never be granted to authenticated.';

/*
 * The policy form. Takes NO user argument and reads auth.uid() itself, so it
 * can answer only "am I barred from this one" and can never be used to probe
 * anybody else. That is the whole reason there are two: this one has to be
 * executable by `authenticated`, because it is evaluated inside an RLS policy
 * body, and a version that accepted a uuid would hand every creator a barred-
 * or-not oracle over every other creator.
 *
 * SECURITY DEFINER for the same reason contest_is_open is: contest_exclusions
 * has no creator policy at all, so an invoker function would read zero rows
 * and return false to every creator, which is exactly backwards.
 */
create or replace function public.contest_excludes_caller(p_contest_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.contest_excludes(p_contest_id, (select auth.uid()));
$$;

comment on function public.contest_excludes_caller(uuid) is
  'Whether the CALLER is barred from this contest. Quoted by both creator select policies on contests and, through contest_excludes, by apply_for_contest, so the catalogue, the own-entry read and the write gate cannot drift apart. Takes no user argument on purpose.';

revoke all on function public.contest_excludes(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.contest_excludes(uuid, uuid) to service_role;

revoke all on function public.contest_excludes_caller(uuid) from public, anon;
grant execute on function public.contest_excludes_caller(uuid) to authenticated;

-- ============================================================================
-- 14. Row security
-- ============================================================================

alter table public.contests               enable row level security;
alter table public.contest_commercials    enable row level security;
alter table public.contest_deliverables   enable row level security;
alter table public.contest_products       enable row level security;
alter table public.contest_entries        enable row level security;
alter table public.contest_entry_targets  enable row level security;
alter table public.contest_entry_terms    enable row level security;
alter table public.contest_exclusions     enable row level security;
alter table public.contest_entry_events   enable row level security;
alter table public.contest_submissions    enable row level security;
alter table public.contest_awards         enable row level security;

-- ---------------------------------------------------------------- staff ---

create policy "contests_select_staff" on public.contests
  for select to authenticated using (public.is_staff());
create policy "contest_commercials_select_staff" on public.contest_commercials
  for select to authenticated using (public.is_staff());
create policy "contest_deliverables_select_staff" on public.contest_deliverables
  for select to authenticated using (public.is_staff());
create policy "contest_products_select_staff" on public.contest_products
  for select to authenticated using (public.is_staff());
create policy "contest_entries_select_staff" on public.contest_entries
  for select to authenticated using (public.is_staff());
create policy "contest_entry_terms_select_staff" on public.contest_entry_terms
  for select to authenticated using (public.is_staff());
create policy "contest_exclusions_select_staff" on public.contest_exclusions
  for select to authenticated using (public.is_staff());
create policy "contest_entry_events_select_staff" on public.contest_entry_events
  for select to authenticated using (public.is_staff());
create policy "contest_submissions_select_staff" on public.contest_submissions
  for select to authenticated using (public.is_staff());
create policy "contest_awards_select_staff" on public.contest_awards
  for select to authenticated using (public.is_staff());

/*
 * There is NO creator policy on contest_commercials, and there must never be
 * one. That table is the reason the split exists.
 *
 * There is NO creator policy on contest_exclusions either. It names people and
 * states an internal judgement about them, which is a defamation-shaped leak
 * rather than a data leak.
 *
 * AND, THE OTHER DIRECTION: there is deliberately no
 * contest_entry_targets_select_staff above, and there must never be one. That
 * table is the ONLY object in this feature staff cannot read, and the block on
 * the table says why. Note that the absence is silent, which is the danger:
 * adding the staff policy would look exactly like completing a list, and every
 * other line in this block is one. It is called out here so the omission reads
 * as a decision rather than as a line somebody forgot to type.
 */

-- -------------------------------------------------------------- creators ---
/*
 * is_approved_creator(), never is_staff(). The JWT refreshes about once an
 * hour, so a creator approved thirty seconds ago is still carrying 'applicant'
 * and would watch their approval land and then find an empty contests screen
 * for up to an hour.
 *
 * TWO policies, not one, and they are different predicates on purpose:
 * openness decides what may be BROWSED, and an existing entry decides what may
 * be READ.
 *
 * BOTH CARRY THE EXCLUSION CLAUSE, and this is the correction of a real hole
 * rather than a flourish. Without it on the FIRST policy, an excluded creator
 * who never applied saw the contest in the catalogue with a working Apply
 * button and was refused only at the Edge Function. Without it on the SECOND,
 * a creator rejected and blocked in one action kept the contest readable
 * through their own rejected entry row, and kept the button with it. One
 * clause, on both, resolved through the single definition above, so the
 * catalogue, the own-entry read and the write gate cannot answer differently.
 *
 * The accepted cost, stated because it is a real loss: a rejected AND blocked
 * creator loses the contest's name and the brand's name on their own history.
 * The contest_entry_events row survives, the contest behind it goes dark. The
 * alternative is telling somebody they are barred, which was refused, or
 * leaving a live button that returns a deliberately vague refusal, which is the
 * bug. A rejected creator who is NOT blocked loses nothing.
 */
create policy "contests_select_creator" on public.contests
  for select to authenticated
  using (
    (select public.is_approved_creator())
    and public.contest_is_open(id)
    and not public.contest_excludes_caller(id)
  );

create policy "contests_select_own_entries" on public.contests
  for select to authenticated
  using (
    exists (
      select 1 from public.contest_entries e
      where e.contest_id = contests.id and e.creator_id = (select auth.uid())
    )
    and not public.contest_excludes_caller(id)
  );

/*
 * contest_deliverables_select_creator and contest_products_select_creator need
 * no exclusion clause of their own. Their subquery reads `contests` under the
 * caller's own row security, so an excluded creator's subquery finds nothing
 * and the child rows disappear with the parent. That is worth knowing rather
 * than guessing at, because it is the only reason those two policies are as
 * short as they look.
 */

-- The brand behind a contest somebody is in stays readable after it is
-- retired, for the same reason brands_select_own_requests exists.
create policy "brands_select_own_contest_entries" on public.brands
  for select to authenticated
  using (exists (
    select 1 from public.contest_entries e
    where e.brand_id = brands.id and e.creator_id = (select auth.uid())
  ));

create policy "contest_deliverables_select_creator" on public.contest_deliverables
  for select to authenticated
  using (is_active and exists (
    select 1 from public.contests c where c.id = contest_deliverables.contest_id
  ));

create policy "contest_products_select_creator" on public.contest_products
  for select to authenticated
  using (exists (
    select 1 from public.contests c where c.id = contest_products.contest_id
  ));

-- Own rows only. No policy lets anybody see another entrant's row.
create policy "contest_entries_select_own" on public.contest_entries
  for select to authenticated using (creator_id = (select auth.uid()));

create policy "contest_entry_terms_select_own" on public.contest_entry_terms
  for select to authenticated
  using (exists (
    select 1 from public.contest_entries e
    where e.id = contest_entry_terms.entry_id and e.creator_id = (select auth.uid())
  ));

create policy "contest_entry_events_select_own" on public.contest_entry_events
  for select to authenticated using (creator_id = (select auth.uid()));

-- The one table with a creator policy and no staff policy. Read the block on
-- the table before touching this line.
create policy "contest_entry_targets_select_own" on public.contest_entry_targets
  for select to authenticated using (creator_id = (select auth.uid()));

create policy "contest_submissions_select_own" on public.contest_submissions
  for select to authenticated using (creator_id = (select auth.uid()));

create policy "contest_awards_select_own" on public.contest_awards
  for select to authenticated using (creator_id = (select auth.uid()));

-- No insert, update or delete policy on any of the eleven, on purpose. Every
-- write goes through a security definer function in the companion migration.

-- ============================================================================
-- 15. Grants
-- ============================================================================
/*
 * Auto expose is off, so nothing is reachable without an explicit grant, and
 * that includes service_role. Missing the second line of each pair is how four
 * content functions shipped returning "permission denied".
 *
 * Table level, never column level. judging_basis needs no grant of its own and
 * must never get one: it rides this line because it is creator facing by
 * design, and the day somebody reaches for a column level grant on contests is
 * the day the budget belongs on this table, which is the thing the split
 * refuses.
 */

grant select on public.contests              to authenticated;
grant select on public.contest_commercials   to authenticated;
grant select on public.contest_deliverables  to authenticated;
grant select on public.contest_products      to authenticated;
grant select on public.contest_entries       to authenticated;
grant select on public.contest_entry_targets to authenticated;
grant select on public.contest_entry_terms   to authenticated;
grant select on public.contest_exclusions    to authenticated;
grant select on public.contest_entry_events  to authenticated;
grant select on public.contest_submissions   to authenticated;
grant select on public.contest_awards        to authenticated;

grant all privileges on table public.contests              to service_role;
grant all privileges on table public.contest_commercials   to service_role;
grant all privileges on table public.contest_deliverables  to service_role;
grant all privileges on table public.contest_products      to service_role;
grant all privileges on table public.contest_entries       to service_role;
-- service_role reads this one because set_contest_entry_target has to write
-- it. Nothing else may read it, and that binds the Edge Function as well as
-- the policies: no response that is not going back to the person who set it.
grant all privileges on table public.contest_entry_targets to service_role;
grant all privileges on table public.contest_entry_terms   to service_role;
grant all privileges on table public.contest_exclusions    to service_role;
grant all privileges on table public.contest_entry_events  to service_role;
grant all privileges on table public.contest_submissions   to service_role;
grant all privileges on table public.contest_awards        to service_role;

-- ============================================================================
-- 16. Realtime
-- ============================================================================
/*
 * Four tables join the publication. contest_commercials and contest_exclusions
 * deliberately do NOT: postgres_changes does not apply row security to DELETE
 * events and every table here carries replica identity full, so a deleted
 * exclusion row would broadcast a barred creator's handle and the admin's
 * reason to every subscriber.
 *
 * contest_entry_targets does NOT join either, for the same reason pointed at a
 * different audience: a deleted target row would broadcast a creator's private
 * number to every subscriber on the channel, staff included, which is the one
 * thing that table exists to prevent. It needs no realtime anyway. A target
 * only ever changes because the creator themselves changed it, in a tab they
 * are looking at, so their own mutation invalidates their own query and there
 * is no second party waiting to hear about it.
 *
 * Every creator-side subscription on the four below MUST pin
 * creator_id=eq.<uid>, and contests must never be hard-deleted while any
 * creator is subscribed to the catalogue channel. Every one of those subscribe
 * calls also passes a status handler, because a dot that claims a live
 * connection has to know when it no longer has one.
 */
alter publication supabase_realtime add table public.contests;
alter publication supabase_realtime add table public.contest_entries;
alter publication supabase_realtime add table public.contest_entry_events;
alter publication supabase_realtime add table public.contest_submissions;

alter table public.contests             replica identity full;
alter table public.contest_entries      replica identity full;
alter table public.contest_entry_events replica identity full;
alter table public.contest_submissions  replica identity full;

-- ============================================================================
-- 17. The views
-- ============================================================================
/*
 * security_invoker on all three, and it is the single most important word in
 * this section. A Postgres view runs as its OWNER by default, which bypasses
 * row level security on everything underneath it. Each one also carries its own
 * grants, because auto expose is off for views exactly as it is for tables.
 */

/*
 * ONE row per entry, keyed to exactly one creator, so it is safe to share.
 * This is the same property that makes job_progress the only shared view in
 * the product: a count over one person's own rows is COMPLETE, not silently
 * narrowed. No is_staff() gate, and that is deliberate.
 */
create view public.contest_entry_progress
with (security_invoker = true) as
select
  e.id            as entry_id,
  e.creator_id,
  e.contest_id,
  e.brand_id,
  e.committed_video_count                                        as required,
  count(s.id) filter (where s.status = 'approved')::int          as approved,
  count(s.id) filter (where s.status = 'submitted')::int         as waiting,
  count(s.id) filter (where s.status = 'needs_another_take')::int as needs_another_take,
  count(s.id)::int                                               as posted,
  /*
   * THE FOURTH SLOT. The tracker has four segments, not three, and this is the
   * fourth: what has not been shot at all. A video sent back for another take
   * cannot go in "still to film", because that phrase means nothing exists yet
   * and that video does exist, and it cannot go in "in review" either, because
   * we have already reviewed it and the ball is back with the creator.
   *
   * Derived rather than counted, and floored at zero, because a keen entrant
   * may file more than the count they committed to and a negative segment
   * would render as a bar growing backwards.
   *
   * NULL required means an open-ended entry. This column is then 0 and the
   * client must not draw the bar at all. A zero here means two different
   * things and only `required` tells them apart, which is why both columns are
   * on the row.
   */
  greatest(coalesce(e.committed_video_count, 0) - count(s.id), 0)::int as still_to_film
from public.contest_entries e
left join public.contest_submissions s on s.entry_id = e.id
where e.status = 'approved'
group by e.id;

comment on view public.contest_entry_progress is
  'One row per approved contest entry: what was committed at approval, and how many videos are approved, waiting, sent back and not shot yet. security_invoker, so the tables underneath still decide who sees what. Entry level only, because an entry belongs to exactly one creator: a contest level count over these tables would return a creator their own row and call it the total.';

grant select on public.contest_entry_progress to authenticated;
grant all privileges on table public.contest_entry_progress to service_role;

/*
 * Contest money, grouped by (contest, currency). Deliberately NOT one row per
 * contest: summing two currencies into one figure is the single arithmetic
 * error this product must never make. In practice contests.currency pins a
 * contest to one, and the grouping is what makes that provable rather than
 * assumed.
 *
 * STAFF ONLY, IN THE BODY, because the grouping key here belongs to many
 * people at once and security_invoker alone would hand a creator a count of
 * their own rows dressed up as the contest's total. is_service_role() is in the
 * gate because service_role carries no user_role claim, so is_staff() is FALSE
 * for the service key and every Edge Function would read zero rows.
 *
 * This is also where the contest budget total comes from. It carries no
 * total_budget column: a percentage of an unknown allocation plus one known
 * reward reconstructs the allocation, so the percentage is computed on the
 * admin screen from this view AND contest_commercials, never in a view a grant
 * could later widen.
 */
create view public.contest_totals
with (security_invoker = true) as
select
  e.contest_id,
  e.brand_id,
  e.currency,
  count(*) filter (where e.status = 'pending')::int   as entries_pending,
  count(*) filter (where e.status = 'approved')::int  as entries_approved,
  count(*) filter (where e.status = 'rejected')::int  as entries_rejected,
  count(*) filter (where e.status = 'withdrawn')::int as entries_withdrawn,
  -- No entries_removed. Nothing can write that status any more, so the column
  -- would be a permanent zero that reads on the admin screen as "we have never
  -- had to remove anybody" rather than as "we cannot".
  coalesce(sum(e.committed_amount) filter (where e.status = 'approved'), 0)::numeric(14, 2)
    as committed,
  coalesce(sum(e.committed_video_count) filter (where e.status = 'approved'), 0)::int
    as videos_promised,
  max(e.created_at) as last_entered_at
from public.contest_entries e
where (select public.is_staff() or public.is_service_role())
group by e.contest_id, e.brand_id, e.currency;

comment on view public.contest_totals is
  'Contest money and entry counts, grouped by contest and currency, staff only in the body. It carries no total_budget: the percentage of a budget spent is computed on the admin screen from this view and contest_commercials together, never in a view a grant could widen.';

grant select on public.contest_totals to authenticated;
grant all privileges on table public.contest_totals to service_role;

/*
 * The same thing rolled to a brand, for the brand Overview and the admin home.
 * Grouped by (brand, currency) for the same reason brand_stage_totals is.
 * Awards are separate from commitments because they are a different money
 * event with a different moment of truth.
 *
 * It exists to make one promise cheap enough that nobody skips it: a brand's
 * contest money is shown BESIDE its offer money on every surface, in its own
 * labelled block, never added into the offer figure and never left off. The
 * eighty percent warning on the brand budget bar keeps meaning offers only and
 * says so in words.
 *
 * DEPARTURE FROM THE PLAN, DELIBERATE, AND THE SAFER OF THE TWO READINGS. The
 * plan's sketch groups by (brand_id, currency, a.awarded) while its own comment
 * says the view is grouped by (brand, currency). Those two cannot both be true:
 * awarded comes out of a lateral evaluated per CONTEST row, so grouping by it
 * would return one row per distinct awarded amount, and a brand with three
 * contests paying three different totals would render as three "brand totals"
 * on the Overview, each counting a subset of its own contests. The stated
 * grouping is implemented and the awarded figure is summed instead, which is
 * the only reading under which the number on the screen is the brand's.
 */
create view public.brand_contest_totals
with (security_invoker = true) as
select
  t.brand_id,
  t.currency,
  count(distinct t.contest_id)::int              as contests,
  sum(t.entries_pending)::int                    as entries_pending,
  sum(t.entries_approved)::int                   as entries_approved,
  sum(t.committed)::numeric(14, 2)               as committed,
  coalesce(sum(a.awarded), 0)::numeric(14, 2)    as awarded
from public.contest_totals t
left join lateral (
  select sum(w.awarded_amount) as awarded
  from public.contest_awards w
  where w.contest_id = t.contest_id and w.awarded_currency = t.currency
) a on true
group by t.brand_id, t.currency;

comment on view public.brand_contest_totals is
  'A brand''s contest money and entry counts, grouped by brand and currency. Reads contest_totals, so it inherits that view''s staff-only gate. Committed and awarded are separate columns because they are two money events with two moments of truth, and neither is ever added into brand_commercials.budget_used, which keeps meaning offers only.';

grant select on public.brand_contest_totals to authenticated;
grant all privileges on table public.brand_contest_totals to service_role;

/*
 * THERE IS NO CONTEST LEADERBOARD VIEW, AND NO STANDINGS SNAPSHOT, AND THERE
 * MUST NEVER BE EITHER. A leaderboard groups across every entrant, which is
 * exactly the shape 20260811230000_brand_rollups.sql:11-19 forbids sharing: a
 * creator querying it under security_invoker gets one row, their own, with no
 * error at all, and the screen renders it as the ranking.
 *
 * Three columns that exist and are in no view above, deliberately: the
 * creator's own target, an entrant headcount on a creator readable row, and the
 * total budget. A view is where all three would arrive quietly, because a view
 * looks like a read rather than like a grant.
 */
