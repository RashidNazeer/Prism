/*
 * What a brand's money and its people are actually doing.
 *
 * Three views, for the brand Overview, the brand's Creators tab and the
 * operations home. They replace arithmetic that would otherwise be done in a
 * browser over whole tables, including one read that already pulls up to five
 * thousand content rows and buckets them by hand.
 *
 * TWO RULES RUN THROUGH ALL THREE.
 *
 * 1. `security_invoker`, plus an `is_staff()` gate IN THE BODY.
 *
 *    security_invoker alone is not enough here. `job_progress` is shared with
 *    creators and is safe because a job belongs to exactly ONE creator, so the
 *    count it returns is complete. These three group by BRAND, where that
 *    property does not hold: a creator reading them would get a well formed
 *    brand-shaped object built from their own rows alone, with no error. A
 *    number that has been silently narrowed is worse than one that refuses, so
 *    they return nothing at all to a creator rather than something plausible.
 *
 *    `is_service_role()` is in the gate for a reason that is easy to miss:
 *    service_role carries no `user_role` claim, so `jwt_role()` coalesces to
 *    'applicant' and `is_staff()` is FALSE for the service key. Without it,
 *    every Edge Function and every line of `verify:rls` would read zero rows
 *    from these views despite the grants below, and would look like a policy
 *    working rather than a bug.
 *
 * 2. NO COMMERCIAL COLUMN, anywhere in them. Not the client, not the
 *    allocation, not the spend. `brand_commercials` is never referenced. So
 *    even if one of these is granted carelessly in a year's time, the thing
 *    that makes it safe to show a brand to a creator at all still holds.
 *
 * And one arithmetic rule: CURRENCY IS A DIMENSION, never a rounding detail.
 * `offer_applications.currency` is per row, so a brand can genuinely hold two.
 * Nothing here adds across them.
 */

-- ============================================================================
-- 1. Where a brand's committed money has got to
-- ============================================================================
/*
 * One row per (brand, stage, currency). Deliberately NOT one row per brand:
 * summing two currencies into one figure is the single arithmetic error this
 * product must never make.
 *
 * It groups by STAGE rather than by paid/due/working, so the stage-to-money
 * mapping stays defined in exactly one place, `STAGE_META` in
 * src/lib/offer-stages.ts. A bucket column in SQL would be a second copy of
 * that mapping and the two would drift.
 */
create view public.brand_stage_totals
with (security_invoker = true) as
select
  a.brand_id,
  a.stage,
  a.currency,
  count(*)::int                                        as jobs,
  coalesce(sum(a.committed_amount), 0)::numeric(14, 2) as committed,
  coalesce(sum(a.committed_video_count), 0)::int       as videos_promised
from public.offer_applications a
where a.status = 'approved'
  and (select public.is_staff() or public.is_service_role())
group by a.brand_id, a.stage, a.currency;

comment on view public.brand_stage_totals is
  'Approved jobs per brand, split by pipeline stage AND by currency, with the count and the committed sum. Staff only. Carries no client, allocation or spend.';

grant select on public.brand_stage_totals to authenticated;
grant all privileges on table public.brand_stage_totals to service_role;

-- ============================================================================
-- 2. What has actually been filmed for a brand
-- ============================================================================
/*
 * Replaces the browser-side fold in `useContentCounts`, which reads up to five
 * thousand rows and silently under-reports past that with no error at all.
 *
 * Only statuses that actually occur produce a row, so a brand nobody has been
 * knocked back on returns no `needs_another_take` row. The screen defaults a
 * missing status to zero rather than rendering a gap.
 */
create view public.brand_content_totals
with (security_invoker = true) as
select
  c.brand_id,
  c.status,
  count(*)::int                         as videos,
  count(distinct c.creator_id)::int     as creators,
  count(distinct c.application_id)::int as jobs,
  max(c.created_at)                     as last_posted_at
from public.content_submissions c
where (select public.is_staff() or public.is_service_role())
group by c.brand_id, c.status;

comment on view public.brand_content_totals is
  'Videos per brand per status, with the distinct creators and jobs behind them. Staff only. content_submissions has no currency, so nothing here can cross one.';

grant select on public.brand_content_totals to authenticated;
grant all privileges on table public.brand_content_totals to service_role;

-- ============================================================================
-- 3. Who is working on a brand
-- ============================================================================
/*
 * One row per (brand, creator) for everyone who has ever asked for one of that
 * brand's offers. This is what makes the Creators tab searchable, sortable and
 * PAGED IN THE DATABASE; folding it in a browser cannot be paged and would
 * truncate silently rather than erroring.
 *
 * Identity comes from the columns snapshotted onto each request, never from a
 * join to `profiles`. Same reason the queue does it: search stays on one table
 * with one trigram index, and the tab still reads correctly after a creator
 * renames themselves or closes their account.
 *
 * The video counts come from a LATERAL rather than a left join. Postgres does
 * not form equivalence classes across an outer join, so `where brand_id = $1`
 * would not reach the nullable side and the whole content table would be
 * aggregated before the brand filter applied. A correlated lateral pushes both
 * the brand and the creator into its own index scan.
 *
 * MONEY IS ONLY MEANINGFUL WHEN `currency_count` IS 1. A creator with two
 * currencies on one brand gets `committed_currency` null, and the screen says
 * so instead of printing a number that added dollars to pounds.
 */
create view public.brand_creator_roster
with (security_invoker = true) as
select
  j.brand_id,
  j.creator_id,
  j.creator_handle,
  j.creator_name,
  j.creator_email,
  j.jobs,
  j.jobs_approved,
  j.jobs_pending,
  j.jobs_rejected,
  j.jobs_working,
  j.jobs_due,
  j.jobs_paid,
  j.videos_promised,
  j.currency_count,
  j.committed_currency,
  j.committed,
  j.paid,
  j.due,
  j.first_asked_at,
  j.last_decided_at,
  j.last_moved_at,
  coalesce(v.videos_posted, 0)             as videos_posted,
  coalesce(v.videos_approved, 0)           as videos_approved,
  coalesce(v.videos_waiting, 0)            as videos_waiting,
  coalesce(v.videos_needs_another_take, 0) as videos_needs_another_take,
  v.last_posted_at
from (
  select
    a.brand_id,
    a.creator_id,
    max(a.creator_handle) as creator_handle,
    max(a.creator_name)   as creator_name,
    max(a.creator_email)  as creator_email,

    count(*)::int                                             as jobs,
    count(*) filter (where a.status = 'approved')::int         as jobs_approved,
    count(*) filter (where a.status = 'pending')::int          as jobs_pending,
    count(*) filter (where a.status = 'rejected')::int         as jobs_rejected,

    /*
     * These three always add up to jobs_approved. `stage` is nullable, and an
     * approved row that somehow lost its stage counts as working rather than
     * vanishing out of the total.
     */
    count(*) filter (
      where a.status = 'approved'
        and (a.stage is null or a.stage not in ('payment_pending', 'paid'))
    )::int                                                     as jobs_working,
    count(*) filter (where a.status = 'approved' and a.stage = 'payment_pending')::int as jobs_due,
    count(*) filter (where a.status = 'approved' and a.stage = 'paid')::int            as jobs_paid,

    coalesce(sum(a.committed_video_count) filter (where a.status = 'approved'), 0)::int
      as videos_promised,

    -- How many currencies this person's approved money is spread across.
    count(distinct a.currency) filter (
      where a.status = 'approved' and a.committed_amount is not null
    )::int as currency_count,

    -- Named only when there is exactly one, so nothing downstream can print a
    -- total that crossed two.
    case
      when count(distinct a.currency) filter (
        where a.status = 'approved' and a.committed_amount is not null
      ) = 1
      then max(a.currency) filter (where a.status = 'approved' and a.committed_amount is not null)
    end as committed_currency,

    coalesce(sum(a.committed_amount) filter (where a.status = 'approved'), 0)::numeric(14, 2)
      as committed,
    coalesce(sum(a.committed_amount) filter (where a.status = 'approved' and a.stage = 'paid'), 0)::numeric(14, 2)
      as paid,
    coalesce(sum(a.committed_amount) filter (where a.status = 'approved' and a.stage = 'payment_pending'), 0)::numeric(14, 2)
      as due,

    min(a.created_at)      as first_asked_at,
    max(a.decided_at)      as last_decided_at,
    max(a.stage_updated_at) as last_moved_at
  from public.offer_applications a
  where (select public.is_staff() or public.is_service_role())
  group by a.brand_id, a.creator_id
) j
left join lateral (
  select
    count(*)::int                                              as videos_posted,
    count(*) filter (where c.status = 'approved')::int          as videos_approved,
    count(*) filter (where c.status = 'submitted')::int         as videos_waiting,
    count(*) filter (where c.status = 'needs_another_take')::int as videos_needs_another_take,
    max(c.created_at)                                          as last_posted_at
  from public.content_submissions c
  where c.brand_id = j.brand_id and c.creator_id = j.creator_id
) v on true;

comment on view public.brand_creator_roster is
  'One row per creator per brand: their jobs, where those jobs stand, what was committed and what has been filmed. Staff only. Identity is the snapshot on the request, never a join to profiles. Money is only meaningful when currency_count is 1.';

grant select on public.brand_creator_roster to authenticated;
grant all privileges on table public.brand_creator_roster to service_role;

-- ============================================================================
-- 4. The indexes these need
-- ============================================================================

-- The roster groups by (brand, creator). The existing brand index leads with
-- (brand_id, status), which cannot serve that grouping.
create index offer_applications_brand_creator_idx
  on public.offer_applications (brand_id, creator_id);

-- brand_content_totals groups by (brand, status). The existing content index is
-- (brand_id, created_at desc), which cannot.
create index content_submissions_brand_status_idx
  on public.content_submissions (brand_id, status);

-- The lateral above, which runs once per creator on the page.
create index content_submissions_brand_creator_idx
  on public.content_submissions (brand_id, creator_id, status);

/*
 * Searching for a person by name or email.
 *
 * `/admin/creators` needs both, and `profiles` has no trigram index at all
 * today, so every search there would be a sequential scan. A TIKTOK HANDLE is
 * deliberately not here: it does not exist on `profiles`. It lives on
 * `applications.tiktok_handle`, which is unique per user, so the creators list
 * searches it through that join and needs its own index.
 */
create index profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops);
create index profiles_email_trgm_idx
  on public.profiles using gin (email extensions.gin_trgm_ops);
create index applications_handle_trgm_idx
  on public.applications using gin (tiktok_handle extensions.gin_trgm_ops);

-- "Everything that has ever happened to this creator" for the person screen.
-- The index for it has existed since day one and no query has ever used it.
comment on index public.audit_log_target_idx is
  'Used by the per-creator history on /admin/creators/:id. Written on day one for exactly that question and unused until 2026-08-11.';
