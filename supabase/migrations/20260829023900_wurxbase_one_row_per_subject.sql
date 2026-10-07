-- ===========================================================================
-- Make the overwrite impossible rather than unlikely.
--
-- Creative angle tests, brand contracts and Discovery marks all ride in
-- `activity_logs` as one row per subject — action plus a target string. They
-- ride there because their old project had no DDL access, and "one row per
-- subject" was therefore a CONVENTION maintained in JavaScript: write the new
-- row, then delete every older row with the same target.
--
-- That convention is the bug. Twenty-seven findings came out of the audit on
-- 2026-08-28 (PARKED 34, docs/WURXBASE_WRITE_SAFETY.md) and six of them lose
-- saved work on an ordinary click, all with the same shape:
--
--   * an empty save deletes everything for that subject and writes nothing in
--     its place, so a screen whose load failed wipes the real test on the next
--     click;
--   * contracts and Discovery marks DELETE BEFORE THEY INSERT, so a save that
--     fails at the second step destroys the old row and then says "could not
--     save";
--   * two people, or two tabs, both sweep and the last one silently wins.
--
-- THE DESIGN THAT WAS WRITTEN FOR THIS IS NOW THE WRONG ONE. Every option in
-- `docs/WURXBASE_WRITE_SAFETY.md` was constrained by "no DDL access on that
-- project", and the recommended one — a compare-and-swap performed by
-- re-reading in JavaScript — says so itself: *"It is not atomic and cannot be
-- made atomic here... Closing that needs a unique constraint or an RPC, and
-- constraint 3 says no DDL."*
--
-- We own the schema since 2026-08-28. So this closes it properly.
--
-- WHAT THIS GIVES THE CODE
--
--   1. `revision`, bumped by every writer. A save becomes a conditional UPDATE
--      — "set this, but only if the row is still on the revision I loaded" —
--      which Postgres evaluates atomically. Zero rows updated means somebody
--      else moved it, and the caller can refuse and reload instead of
--      flattening their work. That is the guarantee JavaScript could not make.
--
--   2. A partial UNIQUE index, so one row per subject is enforced rather than
--      maintained. The insert-then-sweep pattern stops being expressible, which
--      is the point: the DELETE disappears from the save path entirely, and a
--      failed write can no longer destroy what was already there.
--
--   3. `updated_at`, because the row is now edited in place. Their screens show
--      "Saved 33 min ago by masifa" and were reading `created_at` for it; once a
--      row is updated rather than replaced, that would freeze at whenever the
--      test was first started.
--
-- PARTIAL, and the WHERE clause is the whole reason it is safe. `activity_logs`
-- is also their audit trail: LOGIN, CREATOR_ADD, CREATOR_UPDATE. Those SHOULD
-- repeat, and a unique index across the table would reject the second time
-- anybody logged in. Only the three actions that store state are constrained.
--
-- CHECKED BEFORE WRITING THIS, because a unique index over dirty data fails at
-- deploy: BRAND_CONTRACT 2 rows / 2 subjects, CREATIVE_ANGLE 2 / 2,
-- DISCOVERY_MARK 105 / 105. Zero duplicates, and no null targets — which would
-- otherwise slip through, since NULLs are distinct to a unique index.
--
-- THIS MIGRATION AND THE CODE MUST LAND TOGETHER. The moment the index exists,
-- their old insert-then-sweep raises 23505 on the second save of any subject.
-- Both are in the same commit for that reason.
-- ===========================================================================

alter table wurxbase.activity_logs
  add column if not exists revision integer not null default 1,
  add column if not exists updated_at timestamptz;

comment on column wurxbase.activity_logs.revision is
  'Optimistic-concurrency counter for the rows that STORE STATE here — '
  'CREATIVE_ANGLE, BRAND_CONTRACT, DISCOVERY_MARK. A writer updates where '
  'revision = the value it loaded; zero rows affected means somebody else got '
  'there first, and the caller must reload rather than overwrite. Ignored by '
  'the ordinary audit rows, which are append-only and never updated.';

comment on column wurxbase.activity_logs.updated_at is
  'When this row was last written. `created_at` stays the moment the subject '
  'was first saved, which is what their "Saved ... by ..." line should not '
  'show once rows are edited in place rather than replaced.';

-- Backfill, so the first conditional update after this deploy has something
-- truthful to compare against and to display.
update wurxbase.activity_logs
   set updated_at = created_at
 where updated_at is null;

/*
 * ONE ROW PER SUBJECT, ENFORCED.
 *
 * `nulls not distinct` is deliberate: without it two rows with a null target
 * would both be allowed, and a null target is exactly the shape a half-built
 * save would write.
 */
create unique index if not exists activity_logs_one_row_per_subject
  on wurxbase.activity_logs (action, target)
  nulls not distinct
  where action in ('CREATIVE_ANGLE', 'BRAND_CONTRACT', 'DISCOVERY_MARK');

/*
 * The conditional update reads `(action, target, revision)` and the loader
 * reads `(action)` ordered by target. The unique index above serves the first;
 * this serves the second without making the planner walk the whole audit trail.
 */
create index if not exists activity_logs_state_rows
  on wurxbase.activity_logs (action, target)
  where action in ('CREATIVE_ANGLE', 'BRAND_CONTRACT', 'DISCOVERY_MARK');
