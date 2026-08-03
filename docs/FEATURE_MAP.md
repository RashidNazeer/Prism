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
- The offer card carries no status chip. The action at the bottom of it says
  what state the offer is in, and saying it twice made the second one look like
  a different fact.
- The card never says "no fixed deliverable or fee on this one". Spending a line
  on the absence of something a creator never asked about is worse than silence.
- Brands, products and offers are NOT live here (see the offer requests entry
  for what is). The mutation on the admin side refreshes both, and a websocket
  per creator per hub would buy nothing.

## Offer dashboards (both sides, across every brand)

**Files:** `src/routes/admin/AllOffers.tsx`, `src/lib/admin/useAllOffers.ts`,
`src/routes/app/Offers.tsx`, `src/lib/creator/useAllOffers.ts`
**Routes:** `/admin/offers` (catalogue), `/admin/offers/requests` (queue),
`/app/offers` (creator)

The Brand Hub answers "what is this brand offering". These answer what cuts
across brands. Before them, seeing an offer meant remembering which brand owned
it and going in through the hub.

**Change rules**

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
