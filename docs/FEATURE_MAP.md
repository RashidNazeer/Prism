# Feature map

**Why this file exists.** Bugs happen when a new feature silently depends on an
old one. Delete a creator, and their campaigns must vanish from the campaigns
screen too. Add a user, and the team view must show them. This file is the
written record of those links so nothing drifts.

**Rules**

- Before touching any schema or shared logic: read the entries below for
  everything involved, and list the affected features in the step plan.
- After adding any feature: add its entry AND update every entry it touches, in
  the same commit as the code.
- A feature without an entry here is not done.

Structure carries the load first, foreign keys with a consciously chosen
`ON DELETE`, constraints, and shared SQL views so every screen reads the same
truth. This map is the second layer, not the only one.

---

## How much of a job has been filmed (job_progress)

**Files:** `src/lib/work/job-progress.ts`, `src/components/work/JobProgress.tsx`,
`src/components/creator/OfferCard.tsx`, `src/components/content/ContentCard.tsx`,
`.oxlintrc.json`,
`supabase/migrations/*_deliverables_freeze_and_job_progress.sql`,
`scripts/seed-pipeline.mjs`
**Tables:** `offer_applications.committed_video_count` (new),
**View:** `job_progress` (the project's FIRST view)

Built 2026-08-11, the first step of joining the product up (see
`UI_CONNECTIONS_PLAN.md`). Rashid: "he has offers page where he should be seen
how much content he has posted maybe a progress bar".

**Change rules**

- **The deliverable count freezes at approval**, exactly as `committed_amount`
  already did. Rashid's words: once we have approved, an admin should never be
  able to edit the number of deliverables. Nothing may read `offers.video_count`
  for a job already under way; read `committed_video_count` on the request.
  Editing the offer stays allowed and applies to whoever is approved next.
  What does NOT freeze is the brand's budget, which carries on moving on every
  approval exactly as before.
- **`security_invoker = true` on the view is not optional.** A Postgres view
  runs as its OWNER by default, which would bypass row security on both tables
  underneath and hand every creator every other creator's counts.
- **Job level counts only, forever.** This is safe to share between both sides
  because a job belongs to exactly ONE creator, so the count is complete rather
  than silently narrowed. That property does not hold one level up: a creator
  counting the people on an offer gets back 1, their own row, WITH NO ERROR.
  Never build an offer level or brand level count this way.
- **Progress follows the JOB, never the `needs_application` flag.** An offer
  with no job behind it shows no progress. This is the same rule `stateFor` in
  `useAllOffers.ts` already documents from the other side, and breaking it is
  how an admin flipping that flag once hid somebody's live work.
- Only APPROVED submissions count, matching the database's own rule.
- **`review_content` advances a job from ANY stage before content completed**,
  not the two it used to. Approving the last video while a job sat at "sample
  requested" used to strand it forever. `set_offer_stage` re-checks on arrival
  for the same reason, and `job_is_filmed()` is the single answer both use.
- **Taking an approval back walks the job out of content completed**, back to
  content pending, with a stage event the creator reads. It stops at
  content_completed and never drags a job back from payment or paid: those are
  decisions a person made.
- **`src/lib/work/` and `src/components/work/` are NEUTRAL.** Creator code may
  not import admin code and admin code may not import creator code, and that is
  now a build failure via `no-restricted-imports` in `.oxlintrc.json`, not a
  convention. It caught three real violations the day it was added, including
  the admin content screen importing `ContentCard` out of `routes/app/Content`.
  Anything both sides read goes in a neutral file.
- Shared components take everything staff-only as a PROP and contain no role
  check. A card that decides for itself whether the viewer is staff is one
  wrong boolean from being the leak.
- The creator subscription to `content_submissions` MUST pin
  `creator_id=eq.<uid>`. `postgres_changes` does not apply row security to
  DELETE events and the table has `replica identity full`, so the whole old row
  of somebody else's deleted submission would otherwise arrive.
- `node scripts/seed-pipeline.mjs` puts videos against dev's approved jobs in
  five states (`--clean` removes them). It approves through the REAL
  `review_content` rather than setting stages by hand, so it cannot drift from
  the rule and it exercises the finish path on every run.
- Any script that writes `offer_applications` directly (`check-content`,
  `check-live`, `shots-creator`) must set `committed_video_count` itself, the
  way `review_offer_application` would. A job with no agreed count can never be
  "all filmed", so forgetting it silently stops every job from finishing.
- `pnpm verify:content` must pass. It now proves the view is closed to a rival
  creator, that re-scoping an offer does not move an agreed job, and both
  stuck-job fixes.

**The admin side of the same join, 2026-08-11 (step 2)**

Files: `src/lib/work/stage-moves.ts`, `src/routes/admin/OfferRequests.tsx`,
`src/routes/admin/Content.tsx`, `src/routes/admin/AllOffers.tsx`,
`src/lib/admin/useAllOffers.ts` (`useOfferContent`).

- **The queue shows what was AGREED on an approved row, not the offer's price
  today.** It read `row.offer.reward_amount` while fetching `committed_amount`
  and ignoring it, so re-pricing an offer made the queue, the brand's budget and
  the creator's own dashboard give two answers about one promise. A PENDING row
  still shows the offer's live terms, because that is genuinely what the creator
  is asking for.
- **The catalogue asks about every offer on the page and decides on what comes
  back.** It used to skip any offer whose `needs_application` was off, so
  flipping that flag on an offer six people were mid-pipeline on erased all six
  from the screen. Rows back means report them whatever the flag says; no rows
  and the flag off means "Open to everyone". Same rule as `stateFor`.
- **"Approving this finishes the job" is a LABEL, never a confirmation step.**
  Reviewing at speed was a deliberate decision. The label copies the database
  rule exactly (a number must have been agreed, and this approval must reach
  it), or it promises something that does not happen.
- `review_content` has always returned `advanced`, and now `reopened`, and the
  screen threw both away. Finishing somebody's work looked identical to
  approving one of five. It says so now.
- **Every per-row number is one grouped read over the page**: `useJobProgressFor`,
  `useLatestStageMoves`, `useOfferPeople`, `useOfferContent`. Never one query
  per row. The content ids are deduplicated first, because several videos
  usually share one job.
- `useLatestStageMoves` deliberately does NOT select the actor. `actor_id` points
  at `profiles`, which a creator cannot read for anybody else, so an embed would
  return null rather than refusing and the panel would look broken the day
  somebody reuses it on a creator screen.
- These three screens are now on the current design language: sans eyebrows
  rather than mono, `rounded-[20px]` with `shadow-md`, `wx-skeleton` rather than
  `animate-pulse`, and the "waiting" and "to watch" chips use the stage colours
  rather than warning/success, which is the light-mode collision those tokens
  exist to end.

## Brand rollups, the roster and the creator directory

**Files:** `src/lib/admin/useBrandRollups.ts`, `src/lib/admin/useCreators.ts`,
`src/lib/admin/useOpsHome.ts`, `src/components/admin/BrandCreators.tsx`,
`src/routes/admin/Creators.tsx`, `src/routes/admin/CreatorDetail.tsx`,
`src/routes/admin/AdminDashboard.tsx`, `src/lib/tiers.ts`,
`supabase/migrations/*_brand_rollups.sql`,
`supabase/migrations/*_creator_directory.sql`
**Views:** `brand_stage_totals`, `brand_content_totals`, `brand_creator_roster`,
`creator_directory`

Steps 5 to 8 of `UI_CONNECTIONS_PLAN.md`, built 2026-08-11.

**Change rules**

- **All four are `security_invoker` AND carry `is_staff()` IN THE VIEW BODY.**
  That second guard is the difference between these and `job_progress`.
  `job_progress` is shared with creators and is safe because a job belongs to
  exactly ONE creator, so its count is complete. These group by BRAND or list
  every PERSON, where a creator would get a well formed object built from their
  own rows with no error at all. Silently narrowed is worse than refused.
- **`is_service_role()` is in that gate and must stay.** service_role carries no
  `user_role` claim, so `jwt_role()` coalesces to 'applicant' and `is_staff()`
  is FALSE for the service key. Drop it and every Edge Function and every line
  of `verify:rls` reads zero rows despite the grants, which looks like a policy
  working rather than a bug.
- **Not one of them references `brand_commercials`.** No client, no allocation,
  no spend. So a careless grant in a year cannot turn one into a way to read a
  budget. `verify:brands` asserts all four are closed to a signed-in creator and
  that none will answer a question about money.
- **Currency is a dimension, never a rounding detail.** `brand_stage_totals`
  groups by (brand, stage, CURRENCY) and every screen renders one block per
  currency. `brand_creator_roster` names a currency only when the creator has
  exactly one on that brand, and the card says so rather than adding two.
- **The views group by STAGE, not by paid/due/working.** `STAGE_META` stays the
  single source of that mapping; a bucket column in SQL would be a second copy.
- The roster uses a LATERAL for its video counts, not a left join. Postgres does
  not form equivalence classes across an outer join, so `where brand_id = $1`
  would not reach the nullable side and the whole content table would aggregate
  before the brand filter applied.
- **`creator_directory` exists because identity is split across two tables.**
  The account is `profiles`; the handle everybody types is
  `applications.tiktok_handle`. `applications.user_id` is NOT NULL UNIQUE, so
  the join cannot fan out and `count: 'exact'` stays honest.
- The brand hub's Offers tab is paged, so **Overview's counts had to move into
  the database in the same step**. Counting a paged array would have quietly
  turned "12 live of 40" into a description of the first twelve rows.
- The admin home will not say the day is clear until ALL THREE inboxes are
  empty, and it will not say anything until every count has come back. An empty
  cache and an empty queue look identical from a browser.
- `audit_log` reads must pass `subject_type` as well as `subject_id`. The index
  is `(subject_type, subject_id)` and a btree cannot serve a predicate that
  skips its leading column.
- `/admin/brands/:id`, `/admin/creators`, `/admin/creators/:id` and
  `/admin/applications/:id` are all in `check-responsive.mjs` now. Adding the
  last of those immediately found a real 375px overflow that had been there
  since the screen was built: a grid item's min-width is `auto`, so one
  unbreakable link made the page 529px wide in a 375px viewport. Any new
  two-column admin layout needs `min-w-0`.

## Content (video links and ad codes)

**Files:** `src/lib/content.ts`, `src/lib/creator/useMyContent.ts`,
`src/lib/admin/useAdminContent.ts`, `src/routes/app/Content.tsx`,
`src/routes/admin/Content.tsx`, `src/components/content/*`,
`src/components/creator/PostContentDialog.tsx`,
`supabase/functions/manage-content/`, `scripts/check-content.mjs`
**Tables:** `content_submissions`

"Content pending" was the one stage with nothing to do in it. A creator was
told to film and had nowhere to put the result.

**Change rules**

- **How much is left is now answered by the `job_progress` view**, not by
  `progressFor()` in the browser, which was deleted on 2026-08-11. See the entry
  above. It counts against the number frozen on the JOB at approval, never
  `offers.video_count`.
- **A link is a claim until somebody has watched it.** Only APPROVED
  submissions count towards an offer, and `review_content` is the ONLY thing
  that can carry a job to `content_completed`. It does that in the same
  transaction as the approval, so a job can never be short a video and marked
  done. Rashid's call, and the reason uploading does not advance anything.
- Content attaches to the **offer_application**, not the offer. "Five videos
  for $300" is a promise to one creator, so "how many are left" is only
  answerable against that request.
- No insert, update or delete policy on `content_submissions`.
  `manage-content` is the only door and it checks the role PER ACTION, like
  `manage-offer-application`. `submit_content` matches on `creator_id` as well
  as the id so nobody can post onto somebody else's job.
- **We store a LINK, never a file.** The thumbnail comes from TikTok's oEmbed,
  fetched SERVER side. Never from the browser: that endpoint omits its CORS
  headers on error responses, so a deleted post logs a CORS violation, and this
  product does not ship console errors.
- **The thumbnail URL expires.** It is signed with about two days on it, so
  `VideoThumb` asks `content.refresh` (same origin) once when the image breaks
  or was never stored. Playback does NOT depend on any of that:
  `videoIdFrom` falls back to reading the id out of the link.
- oEmbed is unauthenticated and rate limited, so a thumbnail is best effort and
  every card is designed to look right without one. Do not make anything
  depend on it.
- Editing is locked once a video is approved, or the thing we checked and the
  thing on the record could be different videos.
- `pnpm verify:content`: 26 checks, nine of them attacks run as real
  signed-in accounts, including a rival creator and a creator trying to approve
  their own work.

## Design tokens & theming

**Files:** `src/styles/tokens.css`, `src/styles/global.css`,
`scripts/check-contrast.mjs`, `src/components/theme/*`
**Tables:** none yet. Brand Hub theming (Step 6) will add `brands.theme` and
override `--wx-*` at the hub level.

**Depended on by:** every visual surface in the product.

**Change rules**

- Every colour in the app is a `var(--wx-*)` token. No hardcoded hex in
  components, that is what breaks light mode.
- A token added to `[data-theme='dark']` MUST also be added to
  `[data-theme='light']` and vice versa. `pnpm build` fails otherwise.
- Adding a new text/background combination means adding it to the `PAIRS` list
  in `scripts/check-contrast.mjs` so it is contrast-checked in both themes.
- **`--wx-stage-live`, `--wx-stage-due` and `--wx-stage-paid` are the only
  colours allowed to say where money has got to**, and each of the seven
  pipeline stages maps to exactly one of them through `STAGE_META.bucket`.
  Nothing else may use them and the pipeline may not use anything else. They
  exist because accent/warning/success collide in light mode; see DECISIONS.
- **Type is scoped, not global.** `@font-face` for Instrument Sans and Sora
  lives in `global.css` and costs nothing on its own; `.wx-app`, on the
  `AppShell` root, is what actually points `--wx-font-sans` and
  `--wx-font-display` at them. Declaring a face does not download it, so the
  public landing page still ships system fonts and its measured payload is
  unchanged. Moving those two overrides into `tokens.css` would silently put
  two font downloads on the landing page.
- The font files are OURS, in `public/fonts`, not a Google Fonts link. Both are
  variable (`font-weight: 400 700`), so there is one file per subset rather than
  one per weight, and `unicode-range` keeps latin-ext off most sessions.
- The anti-flash script in `index.html` duplicates the theme-resolution logic in
  `ThemeProvider.tsx`. Change one, change the other, same storage key
  (`wurxmediahub-theme`), same fallback.

## Routing & shell

**Files:** `src/app/router.tsx`, `src/app/providers.tsx`, `src/main.tsx`,
`src/components/layout/RouteFallback.tsx`

**Depended on by:** every screen.

**Change rules**

- Every route is lazy (`lazy: async () => ...`) so screens ship as separate
  chunks. A new route without lazy loading is a regression.
- Every route gets `HydrateFallback: RouteFallback`, skeleton, never a spinner.
- `Providers` mounts once per tab. Nothing inside it may take a `key` derived
  from the session, user id, or access token. See CLAUDE.md "Auth rules".

## Supabase client & environment

**Files:** `src/lib/supabase.ts`, `src/lib/env.ts`, `.env.example`
**Tables:** none yet.

**Depended on by:** everything that reads or writes data (from Step 1 onward).

**Change rules**

- There is exactly one Supabase client, created lazily by `getSupabase()`.
  Never call `createClient` anywhere else, two clients race on the refresh
  token and log users out at random.
- Any new browser env var must be added to the Zod schema in `env.ts`, to
  `.env.example`, AND to both Vercel projects. Missing one of the three is the
  usual cause of "works locally, blank on dev".
- Only `VITE_`-prefixed public values belong in `env.ts`. Secrets go to Edge
  Function secrets.

## Landing page (public)

**Files:** `src/routes/Landing.tsx`, `src/components/landing/*`,
`src/components/layout/Section.tsx`, `src/components/ui/Button.tsx`,
`src/content/site.ts`, `src/routes/Apply.tsx`
**Tables:** none. Stats are hardcoded marketing copy, not database reads.

**Depends on:** Design tokens, Routing, Brand mark
**Depended on by:** Applications (Step 3), every CTA points at `/apply`

**Change rules**

- All marketing copy, stats, brand names and the three steps live in
  `src/content/site.ts`. Never hardcode that text in a component.
- Partner logos are real, taken from the marquee on wurxmedia.com and stored in
  `src/assets/brands/`. Never invent a brand name or add a partner Rashid has
  not confirmed.
- Those logos are white artwork on OPAQUE BLACK. They are made theme-safe by
  `.wx-logo` (`--wx-logo-blend` / `--wx-logo-filter`), not by editing the
  images. A new logo must follow the same convention, or it will appear as a
  black rectangle in light mode.
- `.wx-marquee` paints its own background because `mask-image` creates a
  stacking context. That background MUST match the section behind it, or the
  blend breaks.
- `/apply` renders the same `<ApplyForm />` as the hero. Step 3 fills in the
  submit handler; the route must keep working so no CTA breaks.
- Adding a section: wrap it in `<Section>` for rhythm, use `<Reveal>` for the
  scroll-in, and give it a `scroll-mt` if it is an anchor target, the header is
  fixed and will otherwise cover the heading.
- Anchor links (`#how`) must not use react-router `<Link>`; `ButtonLink`
  detects a leading `#` and renders a plain `<a>`. A `<Link to="#how">` is
  treated as a route change and never scrolls.

## Applications (data)

**Files:** `supabase/migrations/*_applications.sql`,
`src/lib/auth/useApplication.ts`, `src/routes/app/Dashboard.tsx`
**Tables:** `applications` (user_id -> profiles.id, ON DELETE CASCADE, UNIQUE)

**Depends on:** Auth and profiles
**Depended on by:** Admin review (Step 4), Creator activation, Home (Step 5)

**Change rules**

- One application per account, enforced by a unique index on `user_id`. Code
  that inserts must handle error code `23505` as "they already applied".
- `status`, `reviewed_by`, `reviewed_at` and `review_note` are staff only,
  enforced by column grants AND the `applications_guard_review_columns`
  trigger. `pnpm verify:apply` proves an applicant cannot approve themselves.
- An applicant may edit their own application only while it is `pending`.
- `tiktok_handle` is stored WITHOUT the leading `@`. Step 7's identity mapping
  depends on that.
- The table is in the realtime publication with `replica identity full`. Any
  new column is therefore visible to realtime subscribers who can read the row.
  Do not put staff-private notes anywhere an applicant can read.
- Deleting an auth user cascades: profile, then application.

## Application form

**Files:** `src/components/landing/ApplyForm.tsx`,
`src/lib/schemas/application-fields.ts`, `src/lib/schemas/application.ts`,
`src/components/ui/Field.tsx`, `src/routes/Apply.tsx`
**Tables:** none yet. Step 3 adds `applications` (status defaults to `pending`).

**Depends on:** Design tokens, Button/Field primitives
**Depended on by:** Admin review (Step 4), Creator profiles (Step 1/4)

**Change rules**

- **The form is not connected to anything.** `onSubmit` fakes a delay and shows
  a success panel that states submissions are not stored. That disclosure stays
  until Step 3 is live.
- The schema is split in two ON PURPOSE. `application-fields.ts` holds the
  option lists and types and is Zod-free, so the form can render without
  pulling Zod (~60 KB gzipped) onto the landing page. `application.ts` holds the
  Zod schema and is imported lazily, on first submit. Do not import
  `application.ts` at the top of a component.
- Adding a field means updating: `application-fields.ts`, the Zod schema, the
  form JSX, the `applications` table migration, the Edge Function, and the admin
  review screen (Step 4). All six, or the field silently goes nowhere.
- Step 3 must import this exact schema inside the Edge Function and re-validate.
  Never trust the client's copy.
- `ApplyForm` is rendered in two places (hero + `/apply`). It must stay
  self-contained, no props that only one placement passes.
- `tiktokHandle` is stored WITHOUT the leading `@` (the schema strips it). Any
  identity mapping in Step 7 must assume that.

## Auth, profiles, roles and tiers

**Files:** `src/lib/auth/*`, `src/components/auth/*`, `src/routes/auth/*`,
`src/app/router.tsx`, `src/app/providers.tsx`,
`supabase/migrations/*_auth_profiles_roles_tiers.sql`
**Tables:** `profiles` (id -> auth.users.id, ON DELETE CASCADE)
**Enums:** `app_role`, `creator_tier`

**Depends on:** Supabase client
**Depended on by:** everything behind a login, from Step 3 onward

**Change rules**

- **Role and tier live only in `profiles`.** Nothing else may store them. The
  JWT copy is a cache for choosing screens, never a permission.
- A user cannot change their own role, tier or active status. That is enforced
  by three separate things and all three must survive any refactor: no INSERT
  grant, a column-level UPDATE grant on `display_name` only, and the
  `profiles_guard_privileged_columns` trigger. `pnpm verify:rls` proves it.
- Adding a column users may edit means adding it to the column grant AND
  deciding whether the guard trigger should protect it.
- `AuthProvider` must never navigate, reload, or be given a `key` tied to the
  session. Redirects belong in `RequireAuth`. This is the whole defence against
  the random-logout problem, and `pnpm verify:session` will catch a regression.
- `@/lib/supabase` is imported **dynamically** in `AuthProvider`, so the public
  landing page does not download the database client. A static import there
  quietly adds ~55 KB gzipped to every visitor. Vite's `manualChunks` also keeps
  Supabase and TanStack Query in separate chunks for the same reason.
- Deleting an auth user cascades to `profiles`. Any future table that hangs off
  a creator needs its own consciously chosen ON DELETE behaviour.
- Role gates in `router.tsx` decide which screen shows. They are not security.
  Every new table still needs its own policies.

## Brand mark

**Files:** `src/components/brand/WurxMark.tsx`, `src/assets/wurx-logo.png`,
`public/favicon.svg`

**Change rules**

- The real Wurx Media logo, taken from wurxmedia.com and downscaled from
  1641x460 (125 KB) to 228x64 (11 KB). Every usage goes through `<WurxMark />`.
- The artwork is cream and drawn for a dark background. Light mode darkens it
  with `--wx-mark-filter`, which uses `brightness()` so the mascot keeps its
  internal contrast. A plain `invert()` would flatten it to a blob.
- `public/favicon.svg` is still the older geometric gold "W" and does NOT match
  the logo. Replace it when a square icon crop is available.

## App shell & sidebar navigation

**Files:** `src/components/layout/AppShell.tsx`,
`src/components/layout/AppSidebar.tsx`, `src/lib/nav.ts`

**Depended on by:** every signed-in screen, for both creators and staff.

**Change rules**

- The navigation lives in `src/lib/nav.ts` and nowhere else. Shipping a screen
  means moving one item from `soon` to `to`, in that file.
- Items without a `to` render as plain text, never as links. A nav item that
  lands somebody on an empty page is worse than one that says "Step 6".
- The shell mounts once and is never keyed on the session. A token refresh must
  not remount it or a half-typed form is lost. `pnpm verify:session` covers it.
- Role and tier in the sidebar come from the profile row, falling back to the
  JWT claim. Claims are up to an hour stale, so a freshly approved creator would
  otherwise still be badged "Applicant".
- The desktop rail and the mobile drawer are the same component. Do not fork it.

## Staff sign in

**Files:** `src/routes/auth/StaffSignIn.tsx`, `src/components/auth/RequireAuth.tsx`,
`src/app/router.tsx`

**Change rules**

- `/admin/login` is the staff screen; `/login` is the creator one. Both call the
  same sign in. This is a different DOOR, not a different LOCK, and must never
  be described or relied on as a security control.
- No sign up link may ever appear on the staff screen. Staff accounts come from
  `scripts/create-admin.mjs` and nowhere else.
- `RequireAuth` picks the door from the path being attempted, so signing out of
  the admin panel returns you to the staff screen. Adding a new staff area means
  extending that check.
- A creator who signs in at the staff door is sent to their own dashboard. Do
  not turn that into an error: it strands people who followed a stale bookmark.

## Sign up timing (the one that keeps biting)

**Files:** `src/routes/Landing.tsx`, `src/app/router.tsx`,
`src/components/landing/ApplyForm.tsx`, `src/lib/auth/useApplication.ts`

Applying creates the account and then writes the application, as two writes.
Between those two moments the user IS signed in but has NO application, and
anything that reacts to "signed in" during that window will race the insert.

**Change rules**

- Never put a screen that can create an account behind a guard that redirects on
  sign-in. `/signup` and `/apply` are outside `RedirectIfSignedIn` for exactly
  this reason.
- `/` only redirects people who were already signed in when the page opened, not
  whoever becomes signed in while on it.
- `ApplyForm` clears the cached application query before navigating.
- `useApplication` re-checks while the answer is `null`.
- All four exist to stop one symptom: a new applicant being told "Finish your
  application" when they just did. If you touch any of them, run
  `pnpm verify:session` several times, not once. It failed roughly 3 runs in 8.

## Brand Hub (brands, products and offers)

**Files:** `src/routes/admin/Brands.tsx`, `src/routes/admin/BrandHub.tsx`,
`src/components/admin/BrandDialog.tsx`, `src/components/admin/OfferDialog.tsx`,
`src/components/admin/BrandAbout.tsx`, `src/components/admin/ProductDialog.tsx`,
`src/components/admin/ImageUploadField.tsx`, `src/lib/admin/useBrands.ts`,
`src/lib/admin/useManageBrand.ts`, `src/lib/admin/useImageUpload.ts`,
`src/lib/schemas/brand.ts`, `supabase/functions/manage-brand/`,
`supabase/migrations/*_brands_and_offers.sql`,
`supabase/migrations/*_brand_about_products_and_creator_access.sql`,
`supabase/migrations/*_brand_assets_storage.sql`, `scripts/check-brands.mjs`,
`scripts/seed-brands.mjs`
**Tables:** `brands`, `brand_commercials`, `brand_products`, `offers`
**Storage:** `brand-assets` bucket

**The domain, so nobody has to guess.** A BRAND is a seller's store on TikTok
Shop. A BRAND HUB is everything that hangs off that brand. A PRODUCT is
something the brand sells, carrying the commission we offer creators on it. An
OFFER is what the brand pays a creator for content ("five videos, $300"), and
always belongs to exactly one brand.

**Depended on by:** the creator Brand Hub (see the next entry), campaigns,
contests, promotions, discounts, creator enrolments and creator-proposed custom
offers.

**Change rules**

- **The client name, the allocated budget and what has been committed of it are
  NOT on `brands`.** They live in `brand_commercials`, one row per brand, staff
  only.
- **`budget_used` is what has been PROMISED, not paid.** It is the sum of every
  approved offer request on that brand, maintained by
  `review_offer_application` in the same transaction as the approval, so the
  request and the total can never disagree. `budget_used_percent` is a stored
  generated column so the brand list can filter on "over 80% used" in the
  database rather than fetching every brand and doing arithmetic in a browser.
  It is null when there is no allocation: a brand with no budget has not used
  0% of anything.
- **Approving is never blocked for going over budget.** Whether to overspend is
  a commercial decision, so the approve dialog says what it will cost and what
  will be left, colours the bar red past 100%, and leaves the choice to a human.
- **Deleting approved requests with the service key leaves `budget_used`
  stale**, because the running total is only ever moved by
  `review_offer_application`. Nothing a browser can reach does that, so it
  cannot happen in normal use, but a cleanup script did it on 2026-08-01 and
  left three brands claiming money nobody had promised.
  `node scripts/reconcile-budgets.mjs` puts it right, and `--dry-run` reports
  without writing. Run it after any hand cleanup that touches requests. That split is what
  makes it safe to show a brand to a creator: the budget is not a column they
  are filtered away from, it is a column that does not exist on anything they
  can read. Column level SELECT grants cannot do this job, because staff and
  creators are both `authenticated`.
  **Never move a commercial column back onto `brands`, and never add a creator
  policy to `brand_commercials`.**
- `useBrands.ts` flattens the two halves back together for admin screens, so a
  brand still reads as one object. `src/lib/creator/useCreatorBrands.ts` is a
  separate file for exactly this reason and must never import from the admin one.
- No insert, update or delete policy exists on any of these tables. Every write
  goes through `manage-brand`, which re-reads the caller's role from `profiles`,
  then calls `save_brand`, `save_brand_about`, `save_offer`, `delete_offer`,
  `save_product` or `delete_product`. Those are granted to `service_role` alone.
  Adding a write policy would open a second door.
- Each write function starts with `assert_active_staff()`, so "who may change a
  brand" is answered in exactly one place. New write functions must use it too.
- The row and its audit entry commit together, in one transaction. The delete
  functions write the audit row BEFORE the delete, so the record of what was
  removed survives the removal.
- **The slug is generated once, on creation, and never regenerated on rename.**
  Creators hold brand hub links, and the creator route is keyed on the slug.
- **Money is `numeric`, never a float. PostgREST hands it back as a JSON
  NUMBER, while the Edge Function can return the same value as a string.** Take
  either (`money()` in `useBrands.ts`), and coerce with `String()` before it
  reaches a text input. A number where a string was assumed is what crashed the
  offer dialog on 2026-07-30.
- `offers.brand_id` and `brand_products.brand_id` are not updatable. Moving one
  between brands would silently change who is paying for it.
- A product's `external_product_id` is unique per brand. Two rows for one TikTok
  Shop product would split a creator's numbers in half.
- Product `price` and `commission_rate` are both optional, like an offer's
  terms. A product gets added before its numbers are confirmed, and the cards
  say "not set" rather than printing a zero somebody reads as real.
- `needs_application` defaults to true. An offer that pays out without anybody
  signing it off has to be chosen on purpose.
- Images go straight to the `brand-assets` bucket from the browser, not through
  the Edge Function. Public read, staff-only write, 2 MB, PNG/JPG/WebP.
  **SVG is excluded on purpose:** it can carry script. Uploads are named with a
  random uuid, never the file the admin picked.
- `pnpm verify:brands` must pass after any change here. It attacks every table
  and the Edge Function as a signed-in creator, and then opens the hub that
  creator is meant to see.

## Brand Hub, creator side

**Files:** `src/routes/app/Brands.tsx`, `src/routes/app/BrandHub.tsx`,
`src/lib/creator/useCreatorBrands.ts`,
`src/components/creator/LockedUntilApproved.tsx`
**Reads:** `brands`, `brand_products`, `offers`. Nothing else.

**Depends on:** the admin side above for everything it shows.

**Change rules**

- **Who may browse is decided by `is_approved_creator()`, which reads the
  `profiles` table, NOT `is_staff()`, which reads the JWT.** A token refreshes
  about once an hour, so gating on the claim would mean somebody watches their
  approval land, clicks through, and finds an empty hub until their session
  catches up. Any future creator-facing policy must use the same function.
- Row level security decides which ROWS arrive: retired brands, inactive offers
  and hidden products never reach the browser. There is deliberately no
  `status` filter in the client queries, because adding one would disguise
  which layer is doing the work.
- These screens sit under the same guard as `/app`, so applicants can reach
  them, and are shown `LockedUntilApproved` instead. Guarding on
  `allow={['creator']}` would read the stale JWT and bounce a freshly approved
  creator. The screens read the profile row, which is current.
- The creator hub opens on **Overview**, the opposite of the admin hub. An
  admin arrives at a brand to do a job; a creator arrives to decide whether they
  want the brand at all, and decides on the brand and its products.
- **The hub header is one compact row**, not a card. It was a tall panel with
  the brand name set large, which repeated what the Overview tab says better and
  pushed the actual content off the first screen. All it has to do is say which
  hub you are standing in. `check-offer-requests.mjs` asserts the tabs start
  above 220px, so it cannot grow back by accident.
- **There is now ONE offer card**, `src/components/creator/OfferCard.tsx`, used
  by this screen and by `/app/offers`. It was written out twice and had already
  drifted: only one showed the per video rate, and only one carried a sentence
  about posting that was not true. Never fork it again.
- The offer card carries no status chip. The action at the bottom of it says
  what state the offer is in, and saying it twice made the second one look like
  a different fact.
- **The open offer note no longer says "start posting whenever you are ready".**
  Content attaches to a job, an open offer has no job behind it, and there was
  nowhere for that creator to post. Rashid's rule of 2026-08-11 is that an offer
  nobody applies for is never counted towards an offer, so the card says it is
  open to every approved creator and stops.
- The card never says "no fixed deliverable or fee on this one". Spending a line
  on the absence of something a creator never asked about is worse than silence.
- **Brands, products and offers ARE live here, as of 2026-08-11.** They were
  not, and the argument for that (a websocket per creator per hub buys nothing)
  was wrong in one specific way: an admin renaming an offer, re-pricing it,
  retiring a brand or adding a product left every creator reading that screen
  on the old version until they happened to refetch. `useCatalogueLive` is ONE
  channel covering all three tables; call it once per screen with a unique key,
  because two channels sharing a name means the second subscribe is silently
  ignored.
- `brand_products` had to be added to the realtime publication for that; brands
  and offers were already members and simply had nobody listening.
- `/admin/offers` is the catalogue and `/admin/offers/requests` is the queue.
  They are separate screens because they are separate jobs, done at different
  times. The sidebar has an **Offers** group holding both.
- **An open offer cannot report how many creators are on it.** It belongs to
  every approved creator and there is no row to count, so the admin list says
  "Open to everyone" rather than showing a zero that reads as nobody wanting it.
  Any future count over offers has to keep that distinction.
- Admin counts come from ONE grouped read over the offers on the page
  (`useOfferPeople`), never one query per row.
- **The creator dashboard filters in the browser, and that is a deliberate
  exception** to the project's server-side-filtering rule. The filters that
  matter (in, waiting, not asked) live in `offer_applications`, not `offers`,
  so paging the offers table would page a list whose useful order is in another
  table. It fetches both once, capped at 200 offers. If a creator ever has more,
  that cap is the thing to notice, and the fix is a view.
- The creator's requests are live here too, so an approval lands on this screen
  as well as inside the hub.
- Applying uses the SAME `ApplyDialog` as the brand hub. Two apply paths that
  drift apart is how one of them ends up sending something different.

## The pipeline, and the creator's dashboard

**Files:** `src/lib/offer-stages.ts`, `src/lib/creator/useMyWork.ts`,
`src/routes/app/Dashboard.tsx`, `src/components/creator/FirstDay.tsx`,
`src/components/creator/StageTracker.tsx`, `scripts/shots-creator.mjs`,
`src/lib/money.ts`,
`supabase/migrations/*_offer_pipeline.sql`,
`supabase/migrations/*_read_offers_you_asked_for.sql`
**Tables:** `offer_applications.stage`, `offer_stage_events`

Approving somebody is the start of the work, not the end of it. Seven stages,
from Pending request to Paid, moved by staff and watched by the creator.

**Change rules**

- **`src/lib/offer-stages.ts` is the single source of the vocabulary**, the
  order, the icons, and which money bucket each stage belongs to. Nothing
  hard-codes a sequence of its own. The SAME labels are used on both sides on
  purpose: an admin and a creator on the phone must mean the same box when they
  say "sample shipped".
- Only an APPROVED request has a stage. Pending has not started and rejected
  never will, so theirs is null rather than a first step nobody is standing on.
- **Money is bucketed by STAGE, never by status.** "Approved" says nothing about
  whether anybody has been paid. Each stage belongs to exactly one bucket, so
  paid plus due plus working always equals the total agreed and a creator can
  add the three cards up and get the big number. Adding a stage means choosing
  its bucket, or that stops being true.
- Moving a request **backwards is allowed**. A sample marked shipped that was
  not shipped has to be correctable, and refusing would only teach people to
  work around the product.
- The stage control on the admin queue applies on change with no confirmation.
  Seven stages across every creator is a lot of clicking, none of it
  destructive, all of it audited, all of it reversible.
- `offer_stage_events` is the creator-readable history, which `audit_log` can
  never be because that is staff only. Anything a creator should be able to see
  about their own work goes here.
- **A creator can always read the offer and brand behind their own request**,
  even after either is switched off. Without that policy, retiring a brand at
  the end of a campaign would blank the name of the thing somebody is still
  being paid for.
- `src/lib/money.ts` holds the formatters. Creator screens must not import from
  `src/lib/admin/*` for them, which is what they used to do.

**The home screen, rebuilt on 2026-08-11 from a design Rashid approved**

- **The only motion on it is a change.** `useJustMoved` diffs the stages between
  renders and flashes the card, bumps the figures and pops the new timeline row
  for 2.6 seconds. The FIRST load is deliberately not a change: everything would
  qualify, the whole board would flash, and people would learn to ignore it.
  There is no count-up on mount for the same reason.
- The timeline is capped at **eight** events. Four jobs walking seven stages
  generate roughly thirty, and a right column taller than the work list beside
  it turns into a wall nobody reads to the bottom of.
- **`FirstDay` is lazily loaded and must stay that way.** It reaches for the
  offers list, the brands list and `ApplyDialog`, and the dialog drags the Zod
  schema chunk behind it. Imported directly, that weight lands on the home
  screen of every creator who already has work. `verify:responsive` caught it as
  a 375px timeout, which is the only reason it did not ship.
- **Two views, both from the design, switched in the URL (`?view=pipeline`).**
  Overview answers "have I been paid and what is coming". Pipeline answers
  "what is sitting where", which is what somebody asks when three jobs are in
  flight and one has gone quiet. `PipelineBoard` is the only thing that reads
  `summary.byStage`, which `summarise()` had always computed and nothing used.
- `STAGE_META.short` exists for the places a stage is a COLUMN rather than a
  sentence: the seven-card board and the first-day grid. `creatorHint` wraps to
  three lines in a 142px column. Adding a stage means writing both.
- `pnpm shots:creator` photographs this screen with a full pipeline in it, both
  themes, four widths. It writes `offer_applications` directly rather than
  through `review_offer_application`, deliberately: the real function charges
  the brand's budget, and a throwaway creator must never move a number an admin
  is reading.

## Offer requests (creators asking, staff deciding)

**Files:** `src/routes/admin/OfferRequests.tsx`,
`src/components/admin/OfferReviewDialog.tsx`,
`src/components/creator/ApplyDialog.tsx`,
`src/lib/admin/useOfferApplications.ts`,
`src/lib/creator/useOfferApplications.ts`,
`src/lib/schemas/offer-application.ts`,
`supabase/functions/manage-offer-application/`,
`supabase/migrations/*_offer_applications.sql`,
`scripts/check-offer-requests.mjs`
**Tables:** `offer_applications`

A creator asks for the offer as it is written. An offer that needs no
application is not in here at all: it is already theirs.

**Countering an offer with your own video count and your own price shipped on
2026-07-31 and was withdrawn the same day, at Rashid's call.** The two
`proposed_*` columns went with it once he confirmed there was no data to
protect. If countering ever returns it needs: two columns, two parameters on
`apply_for_offer`, two fields in the dialog, and a branch in the queue.

**When dropping a column, grep the function bodies.** Removing those two broke
`review_offer_application`, which still named them in its audit row, and the
migration applied without a murmur: plpgsql resolves field names when a
function RUNS, so it stayed valid-looking SQL until an admin clicked Approve
and got a 500. Only `check-offer-requests.mjs` found it, because it approves a
real request through the real screen.

**Change rules**

- **This is the first thing in the product a creator can write.** Every rule
  below exists because of that.
- No insert, update or delete policy on `offer_applications`. `manage-offer-
application` is the only door, and it checks the role PER ACTION: create and
  withdraw need an active creator, review needs active staff. It is the first
  Edge Function both sides call, so a single gate at the top would have been
  wrong.
- `withdraw_offer_application` matches on `creator_id` as well as the row id,
  so a creator cannot aim it at somebody else's request. `check-offer-requests`
  proves that with a second, rival creator.
- **`proposed_video_count` and `proposed_amount` are null on everything written
  since 2026-07-31.** Null means "whatever the offer says". Even while
  countering existed they were never filled with the offer's own numbers, since
  those look identical on the day and stop being the same fact the moment an
  admin edits the offer.
- A create request arriving WITH those numbers is refused out loud, not
  stripped. It can only be a browser tab left open across the change, and
  silently agreeing somebody to the brand's price when they typed their own is
  the worst available outcome.
- The unique index is PARTIAL, covering `pending` and `approved` only. A
  rejected creator can ask again with a different number, which is the entire
  point of letting them name a price. A plain unique constraint would have
  banned them from that offer for life.
- `creator_handle`, `creator_name` and `creator_email` are SNAPSHOTTED onto the
  row, the same way `audit_log` snapshots its actor. It keeps queue search to
  one trigram index on one table, and the queue still reads correctly after a
  creator renames themselves or closes their account. The live profile is not
  joined.
- `review_offer_application` takes `for update` and refuses a second decision
  with `55006`, so two admins clicking at once cannot both decide, and cannot
  both spend the same budget.
- **`committed_amount` is a snapshot taken at approval, never read live from
  the offer.** Re-pricing an offer next month must not rewrite what a creator
  was already promised, nor a budget that has already been reported on. The
  suite proves it by re-pricing an approved offer and checking neither moved.
- **`committed_video_count` is the other half of that snapshot**, added
  2026-08-11 at Rashid's call: once approved, an admin may never change the
  number of deliverables on a job already agreed. Both are set in one place, in
  `review_offer_application`. Anything that writes an approved request directly
  (three scripts do) must stamp BOTH, or that job can never be "all filmed".
  The brand's budget is unaffected and keeps moving on every approval.
- An approved request against an offer with no fixed fee commits nothing
  measurable, so it adds nothing to the budget rather than a guessed number. It
  still counts as a creator on the offer.
- **`delete_offer` refuses while any request is pending or approved.** Settled
  ones cascade with the offer and the audit log keeps them. Deleting an offer
  somebody is waiting on is how you lose a creator.
- The creator's own requests ARE live (`replica identity full`, filtered to
  their own rows). A decision has to land while they are looking at it, for the
  same reason approval does on the dashboard.
- Every write puts `target_user_id` on its audit row, so "everything that has
  happened to this creator" stays answerable with one index.
- `pnpm verify:offer-requests` must pass after any change here. It runs both
  sides in real browsers and spends most of its time attacking the creator write.

## Creator onboarding moments

**Files:** `src/lib/creator/useOnboarding.ts`, `src/components/creator/*`,
`src/routes/app/Dashboard.tsx`, `src/routes/app/Profile.tsx`,
`supabase/migrations/*_creator_onboarding_moments.sql`
**Tables:** `profiles.welcomed_at`, `profiles.approval_celebrated_at`

**Depends on:** applications (for the live status), profiles, realtime.

**Change rules**

- "Once" lives in the DATABASE, never in localStorage. A creator applies on a
  phone and signs in on a laptop; browser storage would replay the welcome as
  if they were new, and would replay the approval celebration on every cache
  clear. Any future one-time moment gets a column here, not a local flag.
- `momentFor()` decides from the profile row alone. Approval wins over the
  welcome, and dismissing approval settles both, or somebody approved before
  they ever opened the hub gets congratulated and then welcomed as a fresh
  applicant.
- The overlays cannot be dismissed by Escape, backdrop click or a close cross.
  The button IS the acknowledgement, and these appear exactly once in a
  creator's life, so a stray tap must not burn them.
- If the acknowledging write fails the moment still closes locally. Nagging
  somebody because a network blip lost the acknowledgement is worse than the
  flag being late.
- The dashboard carries NO account details. They live on `/app/profile`, so the
  home screen is only ever about where the creator stands with us.
- `display_name` is the only column a creator may edit, and that is a database
  fact (the column grant), not a UI choice. Do not add fields to the profile
  form without a matching grant.
- Every suite that signs somebody up has to walk through the welcome, because a
  real creator does. They each have a `dismissWelcome`-style step.

## Admin screen layout

**Files:** `src/components/layout/AppShell.tsx`, every admin route.

Rashid's rules, recorded in CLAUDE.md and binding on new features.

**Change rules**

- **The main area is left aligned against the rail**, capped at `max-w-7xl`, and
  is NOT centred. Centring looks fine on a laptop and falls apart when somebody
  zooms out or opens a wide monitor: the content drifts to the middle and leaves
  a dead gap beside the sidebar, so the page stops reading as one thing.
- **Working content starts high.** Compact headers: a back control, the name, a
  status chip if it earns its place, and the primary action, on one row.
- **Reference data lives under an Overview tab**, not stacked above the work. On
  a record with tabs the DEFAULT tab is the job. The Brand Hub opens on Offers,
  with the brand's facts one tab across.
- **Never show slugs, ids or routes to an admin.** They are plumbing.
- The `gap-px` on a `bg-line` wrapper trick paints gaps with the border colour,
  so a grid whose last row does not divide evenly shows an empty block. Use it
  only for grids with a fixed, evenly dividing item count; anything that grows
  gets separate bordered cards.

## Responsiveness

**Files:** `scripts/check-responsive.mjs`, every screen.

CLAUDE.md makes "works on phone, tablet, laptop and desktop" a binding rule,
because Wurx targets US and UK creators who are mostly on phones. This suite
makes it checkable: every screen is opened at 375, 768, 1024 and 1440px and must
render its content, log nothing, and not scroll sideways. When it fails it names
the element that is too wide.

**Change rules**

- A new signed-in screen goes in the `SCREENS` list in that script. A screen
  nobody checks is a screen that breaks on a phone.
- Assertions must be scoped to `<main>`. The desktop rail is rendered at every
  width and merely hidden by CSS, so an unscoped text match finds the sidebar's
  copy of a label and waits forever on something deliberately invisible.
- **A screen behind an id needs a `via` entry**, which opens the list and
  follows the first row. `/admin/brands/:id`, `/admin/creators/:id` and
  `/admin/applications/:id` were all invisible to this suite until 2026-08-11,
  and the very first run of the new coverage found a real 375px overflow on the
  application detail screen that had been there since it was built.
- **`min-w-0` is the fix for almost every sideways scroll, and it goes on the
  ITEM, not the container.** A flex or grid item's min-width is `auto`, so one
  unbreakable string (a URL, an email) sets a minimum for its own box and every
  box above it. `truncate` does NOT save you: it needs a definite width to
  truncate against. The application detail screen needed it in five places
  before it fitted on a phone.
- **Dialogs need their own check.** A page can pass at every width while a modal
  opened on it does not: the review dialog once pushed its heading above the top
  of a short viewport with no way to scroll back to it, and no page-level
  assertion could see that because the page itself was fine. Any new modal gets
  a case in the "modals" section, asserting its heading and its confirm button
  are actually reachable.
- A modal must scroll INSIDE ITSELF (`max-h` plus `overflow-y-auto` on the
  panel). Putting the scroll on a `fixed inset-0 flex items-center` wrapper
  looks right and is not: overflow past the container's top edge is not part of
  the scrollable region, so the top of a tall dialog becomes unreachable.
- Anything selectable on desktop must be selectable on a phone. Select-all lived
  only in the `md`-and-up column header once, which quietly made bulk review a
  desktop-only feature.

## Admin review & audit log

**Files:** `src/routes/admin/AdminDashboard.tsx`,
`src/routes/admin/Applications.tsx`, `src/routes/admin/Activity.tsx`,
`src/routes/admin/ApplicationDetail.tsx`, `src/components/admin/*`,
`src/lib/admin/*`, `src/lib/schemas/review.ts`,
`supabase/functions/review-application/`, `supabase/functions/_shared/cors.ts`,
`supabase/migrations/*_admin_review_audit_log.sql`,
`scripts/check-review.mjs`, `scripts/seed-applications.mjs`
**Tables:** `audit_log` (new), reads and writes `applications` and `profiles`

**Depends on:** Applications, Auth/profiles/roles, Realtime.
**Depended on by:** every future admin surface. Brands (Step 6), data upload
(Step 7) and money (Step 8) all reuse this shape: Edge Function re-checks the
role, one `security definer` function does the work in a transaction, audit row
written inside that same transaction.

**Change rules**

- Routes: `/admin` is the dashboard (counts and recent activity),
  `/admin/applications` is the queue, `/admin/applications/:id` the detail,
  `/admin/activity` the full audit log. The counts deliberately live on the
  dashboard so the queue opens straight onto the list.
- One decision flow: `ReviewDialog` is used by the row menu, the bulk bar and
  the detail screen. Approving one person and approving forty must not drift
  apart. Do not add a second confirm path.
- Bulk is a server-side LOOP over `review_application`, never a bulk SQL
  statement. Each application keeps its own transaction and its own audit row,
  so one bad item cannot roll back the others or slip through unlogged. The
  batch is capped at 100 in both the schema and the Edge Function.
- A single-item request still returns a real HTTP status (409 for "already
  reviewed"). A batch returns 200 with per-item results, because "nine worked,
  one did not" is not one status code.
- Only `pending` rows are selectable and only they get the action menu. Reviewed
  rows show their status badge instead.
- A decision is **never** a table update from the browser. `applications.status`
  is not in the column grant, a trigger blocks it, and
  `public.review_application()` is granted to `service_role` only. The Edge
  Function is the only door and it re-reads the caller's role from `profiles`
  rather than trusting the JWT claim, which can be an hour stale.
- Status, role, tier and the audit row move in ONE transaction. Splitting them
  into separate REST calls reintroduces the half-approved state that
  `profiles_tier_only_for_creators` exists to prevent.
- `audit_log` has a select policy for staff and **no insert, update or delete
  grant to `authenticated` at all**. Never add one. An audit trail an admin can
  edit is not an audit trail.
- Any new browser-invoked Edge Function must reuse `_shared/cors.ts`, which
  echoes `Access-Control-Request-Headers`. Our Supabase client sends a custom
  `x-application-name` header, and a hand-written allow-list silently fails the
  preflight so the action appears to do nothing.
- Every response from an Edge Function needs the CORS headers, including the
  error ones. A 403 without them reaches the browser as an opaque network
  failure and the user sees the wrong message.
- The queue is paginated in the database and its filters live in the URL. Never
  fetch every application and filter in the browser.
- Approving relies on `useApplication`'s realtime subscription to update the
  applicant. `AppShell` and `Dashboard` therefore prefer `profile.role` over
  `claims.role`; going back to the claim would make the change invisible for up
  to an hour.
- `pnpm verify:review` must pass after any change here. It approves, rejects,
  and then attacks the API as a signed-in applicant.

---

## Not built yet

These get entries as they are built. Listed so the dependency shape is visible
early.

| Feature                      | Arrives | Will depend on                 | Will be depended on by         |
| ---------------------------- | ------- | ------------------------------ | ------------------------------ |
| Auth, profiles, roles, tiers | Step 1  | Supabase client                | everything                     |
| Landing page                 | Step 2  | Design tokens                  | Applications                   |
| Home                         | Step 5  | Facts, brands, announcements   | none                           |
| Brand Hubs + theming         | Step 6  | Brands, design tokens          | My Numbers, Leaderboards       |
| Data pipeline + facts        | Step 7  | Creators, brands, identity map | My Numbers, Leaderboards, Home |
| My Numbers                   | Step 8  | Facts, Brand Hubs              | none                           |
| Leaderboards                 | Step 9  | Facts, privacy flag            | Brand Hubs                     |
| Offers + Discord             | Step 10 | Tiers, Brand Hubs              | none                           |

## Contests

Built 2026-08-13 and 14. **Read docs/CONTESTS_PLAN.md before touching it**, it
holds the numbered rules and most were learned the hard way in one night.

**A contest is a list of DELIVERABLES**: a type (gmv or video_count), a target,
and a reward. Placings were dropped, so there is no ranking and no judging
sentence. Anybody who reaches a target earns its reward, and several creators
can earn the same one.

**Progress is typed by the creator and confirmed by staff.** Cumulative totals,
never increments. THE TARGET IS READ ONLY TO A CREATOR in the browser and on the
wire: no function they can reach takes a target or a reward argument, and the
creator door uses a strict object so sending one is refused rather than
stripped. A claim asks for exactly the NEW videos, so 5 to 6 asks for one link
and one ad code. The count may not go backwards.

**Nothing counts until staff confirm it.** A creator typing their own GMV is a
creator typing their own payslip, so confirmed and claimed are never added and
never drawn the same. Money is only ever owed against a confirmed figure.

**CONFIRMING IS THE MONEY EVENT** (Rashid, 2026-08-14). The moment staff confirm
a figure that crosses a target, `review_contest_progress` writes a
`contest_awards` row in the same transaction and that reward is OWED. It is not
worked out at the end of the contest, because there is nothing left to work out:
placings are gone, so nothing is contingent on anybody else.

- **`contest_awards` is a bill, not a settlement table.** Every row is money
  against one FROZEN TERM, never against the live deliverable, so an admin
  adding a deliverable on Friday cannot owe money on Monday's entry. It carries
  `reached_value`, the figure that crossed the target, frozen, so a receipt read
  six weeks later does not quote a number nobody was paid on.
- **Two states, owed then paid.** `paid_at` null is owed. `pay_contest_awards`
  takes a LIST and does the whole list in one transaction. **There is no way to
  unpay**; the guard is a confirmation step on the screen.
- **One award per promise**, as a unique constraint, and it is the double
  payment guard: a creator who reports 640 then 900 crosses the same 500 target
  twice and is paid for it once.
- **`private.award_reached_terms` is the only writer**, and it is in `private`
  because PostgREST exposes every executable function in an exposed schema, so
  in `public` a money writer taking an entry id and a figure would be an
  endpoint. The suite asserts a signed-in creator cannot reach it.
- **Rule S8 lives on payment now, not on settlement.** Paying a suspended
  creator needs `p_allow_suspended`; awarding one does not, because they keep
  everything they earned and the deliberate act is sending the money.
- **Going over budget is allowed and shown, never blocked**, the same rule the
  brand budget bar has followed since 2026-08-01. A confirmation is a statement
  about what somebody actually did, and a budget must not make us pretend they
  did less.

**`settle_contest` CLOSES a contest and moves no money.** It was rewritten on
2026-08-14 and the old five argument version was DROPPED, so nothing can pass it
outcomes. It refuses while any entry is pending (rule L12) and, new, **while any
progress claim is pending**: that claim could never be confirmed afterwards, and
confirming is the only thing that can owe somebody money, so closing over one
would silently cancel a reward already earned. It reports what is still unpaid
rather than refusing on it, and paying keeps working on a closed contest.

The name stays `settle_contest` against the instinct to rename it, because
`settled_at`, `settled_by`, the `settled` entry event and the `contest.settled`
audit action all say settled. The screen says "Close this contest".

**Standing without names.** my_contest_standing is a security definer function,
not a view, returning ONLY the caller's own position from auth.uid() with no
user id argument. It never returns another entrant's figures or identifiers.

**Two doors.** manage-contest is staff only. enter-contest requires an active
creator. A creator must never reach the staff door and cannot.

**CONTEST MONEY IS ON THE CREATOR HOME, BESIDE OFFER MONEY, NEVER IN IT.** Added
2026-08-14. `/app` used to count offer money only, which was complete until
contest rewards existed. `ContestEarnings` is its own card reading its own query
(`useContestEarnings`, one read of `contest_awards`), and the separation is
STRUCTURAL rather than a label: the offer money card's three cells add up to its
own headline by construction, which is the property that lets a creator check
our arithmetic, and a contest reward dropped in there would quietly make that
headline a lie. The card also says the rule in words, for anybody reading rather
than looking.

Three things that fall out of it, all of them real people rather than edge cases,
because contests are open to every approved creator regardless of which brands
they work with:

- **A creator with contest money is not on their first day**, and `nothingYet`
  used to say they were, sending somebody who was owed $850 to a screen telling
  them to take their first offer.
- **A creator with contest money and NO offer work does not get the money card**,
  because it would read "$0 across 0 jobs" over an empty bar and three zero
  cells, sitting above the only money they have. Their money leads, and the
  first-day panel underneath does its real job.
- **That panel's "Earned so far: Nothing yet" was hardcoded** and became a lie
  the moment it could sit under a contest reward. It says "Earned from offers"
  now, and deliberately does NOT quote the contest figure, because that figure is
  already on the screen and printing it twice invites somebody to add them.

**Screens.** /admin/contests, /admin/contests/claims, **/admin/contests/rewards**,
the Contests tab in a brand, the full screen setup form at
/admin/brands/:id/contests/:contestId, and /app/contests with two views, the list
and the creator's own dashboard. The three admin screens are three jobs: what is
running, who is waiting on us, what it cost. Rewards opens on OWED, because that
is the job; Paid is the record, one click across, in the URL.

**Traps already paid for.** The contest budget lives in contest_commercials, its
own staff only table, for the same reason the brand budget does. There is no way
to remove a creator from a contest they joined, deliberately, and the plan says
not to add one without asking. An exclusion is scoped to ONE contest. Deadlines
are stored with an IANA zone name beside them and always shown in the zone the
admin chose, never the reader's. **`contest_awards.message` is read by the
creator**, which is why it is not called `note`, the same trap as `cancel_reason`
on 2026-08-13.

**`pnpm verify:contests`, 121 checks.** It drives the admin screens, then the
CREATOR screens in a second real browser (the contest list, the entry dialog and
the progress dialog), then the whole money path: file a claim, confirm it, watch
the reward appear as owed, pay it on the rewards screen, watch the creator's own
screen say paid, then close the contest. Sixteen of them are attacks, including a
rival creator who can read none of it.

Two things in that suite worth not relearning. **Waiting for "You are in"
matched the entry dialog's own heading, "You are in the moment you tap"**, so it
passed instantly and read the database before the write landed; the dialog
CLOSING is the signal. And **every queue locator is scoped to this contest's
card**, because dev carries real seeded claims and the first Confirm button on
the screen belongs to whoever has been waiting longest.

---

## Realtime, and the one rule about it

**Everything that listens to Postgres goes through `joinChannel` in
`src/lib/realtime.ts`. Nothing calls `supabase.channel()` itself.** As of
2026-08-14 that is true of every hook in the product; there are no exceptions
left.

**The bug it exists to kill**, which took the whole page down on 2026-08-13:

```
cannot add `postgres_changes` callbacks for realtime:job-progress:<uuid>
after `subscribe()`
```

`supabase.channel(name)` does NOT always make a new channel. If one with that
name is already open it hands back the EXISTING one, so when two components on
one screen both subscribe, the second calls `.on()` on an already-subscribed
channel, supabase-js throws, and because it throws during render React replaces
the page with an error screen. A creator clicking "Add a video" saw exactly that.

**Unique names are not the fix.** They stop the crash and cause a quieter
problem: N components opening N subscriptions to the same rows, and the first to
unmount tearing the channel out from under the others, because `removeChannel`
does not care who else is listening. `joinChannel` reference counts instead: the
first caller opens and subscribes, later callers add a listener, the channel goes
when the last listener does.

**What that changed when the last eight hooks moved onto it:**

- `useCatalogueLive` **lost its `key` argument**. Three screens passed 'hub',
  'brands' and 'offers' because of a comment telling callers to work around this
  exact footgun. Three subscriptions to identical rows became one.
- `useAllOffers` and `useOfferApplications` now **share the channel name
  `offer-applications:<creator>`**. Both watch one thing, this creator's own
  rows, and they had two names for it. `useOfferApplications` also had the brand
  in its NAME but never in its FILTER, so it opened one subscription per brand
  to the same rows.
- `useMyWork` keeps its own name because it watches a second table.
  `joinChannel` refuses to let two different binding sets share a name, loudly in
  development, and it is right to.

**A filter is load bearing, not tidiness.** `postgres_changes` does not apply row
security to DELETE events, so an unfiltered binding hands the browser the old row
of somebody else's deleted record. Every creator-facing binding carries
`creator_id=eq.<uuid>`.

**Two tables are deliberately OUT of the realtime publication**:
`contest_progress_updates`, because a creator's claimed GMV would broadcast on a
DELETE to anybody who opened an unfiltered channel by hand, and there is no
creator-facing reason to need it live. A decision on a claim invalidates the
query directly instead.
