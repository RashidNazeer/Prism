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

## Brand Hub (brands and offers)

**Files:** `src/routes/admin/Brands.tsx`, `src/routes/admin/BrandHub.tsx`,
`src/components/admin/BrandDialog.tsx`, `src/components/admin/OfferDialog.tsx`,
`src/lib/admin/useBrands.ts`, `src/lib/admin/useManageBrand.ts`,
`src/lib/schemas/brand.ts`, `supabase/functions/manage-brand/`,
`supabase/migrations/*_brands_and_offers.sql`, `scripts/check-brands.mjs`,
`scripts/seed-brands.mjs`
**Tables:** `brands`, `offers`

**The domain, so nobody has to guess.** A BRAND is a seller's store on TikTok
Shop. A BRAND HUB is everything that hangs off that brand. An OFFER is what the
brand pays a creator for content ("five videos, $300"), and always belongs to
exactly one brand.

**Depended on by:** campaigns, contests, promotions, discounts, creator
enrolments and creator-proposed custom offers, none of which exist yet.

**Change rules**

- **Creators cannot read `brands` at all, and that is deliberate.** The table
  carries the allocated budget and the client's name. Column level SELECT
  grants cannot help, because staff and creators are both `authenticated`. When
  the creator hub is built it gets a column-limited view; do NOT simply add a
  creator SELECT policy to this table.
- No insert, update or delete policy exists on either table. Every write goes
  through `manage-brand`, which re-reads the caller's role from `profiles`,
  then calls `save_brand`, `save_offer` or `delete_offer`. Those are granted to
  `service_role` alone. Adding a write policy would open a second door.
- Each write function starts with `assert_active_staff()`, so "who may change a
  brand" is answered in exactly one place. New write functions must use it too.
- The row and its audit entry commit together, in one transaction.
  `delete_offer` writes the audit row BEFORE the delete, so the record of what
  was removed survives the removal.
- **The slug is generated once, on creation, and never regenerated on rename.**
  Creators will hold brand hub links.
- **Money is `numeric`, never a float, and PostgREST returns it as a STRING.**
  Parse only at the point of display (`money()` in `useBrands.ts`). Never parse
  it to store or send back, or a penny will go missing.
- `offers.brand_id` is not updatable. Moving an offer between brands would
  silently change who is paying for it.
- When creator enrolments arrive they hang off `offers` with
  `on delete restrict`, so a brand with real creator commitments cannot be
  deleted out from under them. `offers.brand_id` cascades today only because
  nothing depends on an offer yet.
- `needs_application` defaults to true. An offer that pays out without anybody
  signing it off has to be chosen on purpose.
- `pnpm verify:brands` must pass after any change here. It attacks both tables
  and the Edge Function as a signed-in creator.

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

| Feature | Arrives | Will depend on | Will be depended on by |
| --- | --- | --- | --- |
| Auth, profiles, roles, tiers | Step 1 | Supabase client | everything |
| Landing page | Step 2 | Design tokens | Applications |
| Home | Step 5 | Facts, brands, announcements | none |
| Brand Hubs + theming | Step 6 | Brands, design tokens | My Numbers, Leaderboards |
| Data pipeline + facts | Step 7 | Creators, brands, identity map | My Numbers, Leaderboards, Home |
| My Numbers | Step 8 | Facts, Brand Hubs | none |
| Leaderboards | Step 9 | Facts, privacy flag | Brand Hubs |
| Offers + Discord | Step 10 | Tiers, Brand Hubs | none |
