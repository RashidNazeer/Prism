# Project state

**Last updated:** 2026-07-30
**Current step:** Step 6, Brand Hub. Admin side approved. Creator side and offer
requests built, waiting on Rashid's test.
**Next:** his call. Campaigns and briefs, or contests, are the natural next
sections of the hub.
**Status:** Everything below is built, tested and on `dev`. Everything except
the creator Brand Hub has also been tested by Rashid.

---

## Where we are

Built and approved, in the order it happened: setup, landing page, auth and
roles, the application flow, the admin review panel, creator onboarding, and
the admin side of the Brand Hub. Rashid reorders the roadmap freely, so treat
the step numbers as labels rather than a sequence.

Read **FEATURE_MAP.md** before touching any of it. Several rules there are
non-obvious and were learned the hard way.

**Prod is frozen.** Everything pushes to `dev` only. `main` stays where it is
until Rashid says "make it live".

## Done

### Step 0, setup (approved)

- Toolchain and token-based CLI access, without touching Rashid's other logins.
- GitHub `RashidNazeer/WurxMediaHub` (private), `main` + `dev`.
- Supabase `wurxmediahub-dev` / `wurxmediahub-prod`, automatic RLS on,
  auto-expose off. Vercel wired, each project builds only its own branch.
- Design tokens with `pnpm check:contrast` enforcing dark/light parity and
  WCAG AA inside the build.

### Step 2, landing page (built, revised)

- System fonts, no web fonts at all. Real partner logos in a pure CSS marquee.
  Real Wurx logo. Initial download roughly 284 KB to 159 KB.
- Application form in the hero. Validates properly, **not connected to a
  database**; the success panel says so and a test enforces that disclosure.

### Step 1, auth and roles (this step)

- `profiles` table with `app_role` and `creator_tier` enums, RLS deny by
  default, explicit grants, and a `tier only for creators` constraint.
- `custom_access_token_hook` puts role, tier and active status into the JWT.
- Sign up, sign in, sign out, forgot password, reset password.
- Route guards per role, placeholder home for creator/applicant, ops/admin and
  creative strategist. Suspended-account screen.
- `pnpm verify:rls`: 18 checks, including three privilege escalation attempts.
- `pnpm verify:session`: 18 checks covering every scenario in section 11.

### Step 3, application flow (this step)

- The hero form IS the sign up. One password field added; `/signup` and
  `/apply` render the same form. The old account-only signup page is gone.
- `applications` table with RLS, staff-only review columns, and realtime.
- Submitting creates the account, stores the application, and lands the person
  on a live status screen. If the insert fails the dashboard offers to finish.
- "Apply" in the header now scrolls to the form and focuses it. It previously
  appeared to do nothing on desktop, where the form is already on screen.
- `pnpm verify:apply`: 15 checks end to end, including an applicant trying to
  approve their own application straight against the REST API.

### Step 4, admin panel (this step)

- Review queue at `/admin`: paginated in the database, status tabs, a
  "worked with Wurx" filter, handle search (trigram indexed), newest/oldest
  sort. Filters live in the URL so a view is shareable.
- Detail screen at `/admin/applications/:id` with everything they submitted,
  their account, and the decision controls behind a confirmation step.
- Approve sets role to `creator` and assigns a tier. Reject leaves the account
  untouched so it can be revisited.
- Both go through the `review-application` **Edge Function**, which verifies the
  token with the auth server and re-reads the caller's role from `profiles`
  rather than trusting the JWT claim.
- One `security definer` function, `review_application()`, does the whole thing
  in a single transaction: application status, profile role and tier, and the
  audit row.
- `audit_log` table: staff can read it, nobody can write it from a browser.
  Blocked review attempts are logged too.
- The applicant's dashboard changes live, no refresh and no new token.
- `pnpm verify:review`: 34 checks, including seven attacks run as a real
  signed-in applicant, and a double-decision race.
- `node scripts/seed-applications.mjs` puts seven demo applications on dev
  (`--clean` removes them).

### Step 4 revision, after Rashid's review on 2026-07-30

- **Vertical sidebar** for every signed-in screen, creator and staff, replacing
  the top bar. Rashid's call: a lot of sections are still to come and they need
  somewhere to live. Sections not built yet are listed and tagged with the step
  that brings them, and are not links.
- Audit log moved off the queue page onto its own `/admin/activity` screen.
- `/` now sends a signed-in visitor to their own home.
- **"Already a partner? Sign in"** added to the desktop header. It previously
  existed only inside the mobile menu, so on a desktop there was no way back in
  at all.
- Fixed a real race: a new applicant could land on their dashboard and be told
  "Finish your application" when they had just submitted one. See DECISIONS and
  the "Sign up timing" entry in FEATURE_MAP.
- **Staff sign in moved to its own screen at `/admin/login`**, badged "Staff
  access", with no sign up link. Signed-out visits to any `/admin` route go
  there. A different door, not a different lock.

### Step 4 revision two, after Rashid's review on 2026-07-30

- **Dashboard** at `/admin` with the counts, the fast-track pile and recent
  activity. The queue moved to `/admin/applications` and now opens straight onto
  the list, with counts on its tabs instead of a block of tiles above it.
- **Row actions** on pending applications: view their TikTok profile, approve,
  reject, without opening the application.
- **Bulk approve and reject.** Select some or all pending rows on the page and
  decide in one action. Server-side loop, one transaction and one audit row per
  person, capped at 100.
- Rows show the handle only. The email moved to the detail screen, so rows are
  shorter and more fit on a phone.
- **The sidebar collapses on desktop**, remembered between visits, and the theme
  toggle moved to the top right.
- `pnpm verify:responsive`: every screen at 375, 768, 1024 and 1440px, asserting
  no sideways scroll and a clean console, plus the review dialog on short
  screens. Responsiveness is now a rule in CLAUDE.md, not a hope.
- A multi-agent adversarial review of this work found eight real defects, all
  fixed: an unreachable dialog heading on short phones, 16px tap targets on the
  queue, no keyboard route into the row menu, no focus handling on the drawer or
  the dialog, a WCAG AA failure on the tab counters in light mode, a dashboard
  that claimed the queue was clear before it knew, and a transparent sticky top
  bar. Select-all was also desktop-only and is now on phones too.

### Step 5, creator onboarding (this step)

Approved by Rashid on 2026-07-30, ahead of the original Step 5.

- **Welcome moment**, once, the first time a creator lands in the hub: branded
  card, staggered entrance, what the hub gives them (deliberately not a repeat
  of the landing page), and a gold outline button that fills on hover.
- **In review screen**: centred, with a living clock, a three step tracker
  (Applied, In review, Approved) and their handle. Replaces the old row of
  cards. No account details, no scratch note.
- **Approval moment**, once: confetti built from `--wx-*` tokens, a springing
  tick, their tier named, and the reviewer's note. It arrives live, so an admin
  approving someone triggers it under their hands.
- **Once is enforced by the database**, `profiles.welcomed_at` and
  `profiles.approval_celebrated_at`. Not localStorage, so a new device or a
  cleared cache cannot replay either.
- **`/app/profile`**, a real profile screen: display name is editable (the only
  column granted to a creator), plus account and application details.
- Sidebar user block compacted to avatar, name, email and a sign out icon.
- `pnpm verify:responsive` now covers the creator screens too.

### Step 6, Brand Hub phase one (this step)

Admin side only. The creator experience comes later, built on what admins
configure here.

- **Brands** at `/admin/brands`: name, TikTok Shop store id, client name and
  allocated budget. Searchable, paginated, active or retired. A brand is
  retired with a switch, never deleted.
- **Brand Hub** at `/admin/brands/:id`, with tabs for Offers, Campaigns,
  Contests, Promotions, Discounts and Creators. Only Offers is built; the rest
  are listed and marked, the same honesty the sidebar uses.
- **Offers**: badge, title, description, video count, reward, currency, status,
  and needs-application. The dialog summarises the deal ("5 videos for $300,
  $60 per video") before it is saved.
- Every write goes through the `manage-brand` Edge Function and one of three
  security definer functions, each audited in the same transaction.
- Offers are live: two admins in one hub see each other's edits.
- `pnpm verify:brands`: 38 checks, ten of which are attacks run as a signed-in
  creator.
- `node scripts/seed-brands.mjs` puts four demo brands and six offers on dev
  (`--clean` removes them).

### Step 6, Brand Hub phase two (this step)

The brand's own story, its products, and the creator side.

- **The money moved.** `client_name` and `budget_allocated` are no longer
  columns on `brands`. They live in `brand_commercials`, one row per brand,
  readable by staff only. That is what makes it safe to show a brand to a
  creator at all, and it is the single most important thing in this step.
  See DECISIONS for why a split beat a column-limited view.
- **About tab** in the admin hub: brand logo, tagline and description, written
  for creators rather than for us. Saved through its own `brand.about` action so
  it cannot touch the name, the store id or the budget.
- **Products**, managed inside About: name, TikTok Shop product id, image,
  price, optional badge, and the commission percentage we offer. Price and
  commission are optional, like an offer's terms.
- **Image upload** to a public `brand-assets` bucket, staff-only write, 2 MB,
  PNG/JPG/WebP. No pasting URLs.
- **Creator brand list** at `/app/brands` and **creator Brand Hub** at
  `/app/brands/:slug`, keyed on the slug because creators hold these links.
  Overview carries the brand's story and its products with the commission on
  each; Offers carries the offer cards. The other five tabs are listed and
  marked, the same honesty the sidebar uses.
- Somebody still in review sees `LockedUntilApproved` rather than an empty page,
  and the sidebar shows Brand hubs as "Once approved" rather than as a link.
- `pnpm verify:brands`: 85 checks, up from 47. The two that used to assert "a creator sees
  zero brands" were REPLACED, not deleted, with ones proving they see the safe
  fields, that a budget is not a column they can even ask for, that
  `brand_commercials` is closed to them, and that neither the budget nor the
  client appears anywhere on the rendered page.
- `node scripts/seed-brands.mjs` now seeds taglines, descriptions and eight
  products alongside the brands and offers.

### Step 6, Brand Hub phase three (this step)

Creators ask for offers. Staff decide.

- **A creator can take an offer as written, or counter it** with their own
  video count and their own price. Same row either way. An offer with no fixed
  terms can only be countered, because there is nothing to accept.
- An offer that needs no application shows a tick and "You are already on this
  one" instead of a button. There is nothing to ask for, so there is nothing to
  click.
- The creator's card then tracks the request: with the team, you are in, or not
  this time with the reason. **A decision arrives live**, no refresh.
  They can withdraw while it is still pending, and ask again after a rejection.
- **New admin screen at `/admin/offers`**, under Applications in the sidebar.
  Status tabs with counts, brand filter, search by handle, name or email, sort,
  server-side pagination. Every filter lives in the URL. The numbers being
  agreed to are the largest thing on each row, and a counter offer is shown
  against what the offer actually said.
- Approve or reject with a note the creator reads. One decision only: a second
  one is refused even if two admins click at once.
- **An offer somebody is waiting on cannot be deleted.**
- The creator hub header was cut from a tall card to one compact row, and the
  offer cards lost their status chip and the "no fixed deliverable" line.
  Rashid's note: the main content area should carry what matters.
- `pnpm verify:offer-requests`: 42 checks across two real browsers, nine of
  which are attacks run as a signed-in creator, including a second creator
  trying to read and withdraw the first one's requests.

**Not built, by design:** what happens after approval. An approved request says
a creator is on that deal; tracking their videos and paying them out is Step 7
and Step 8 work.

## Known bugs

None outstanding.

## Parked work

Everything we have consciously deferred lives in **[PARKED.md](PARKED.md)**.
When Rashid asks "what's pending?", answer from that file. Do not duplicate the
list here.

## Next action

**Rashid's call.** The Brand Hub now has brands, products, offers, and creators
asking for them. The remaining hub sections are Campaigns and briefs, Contests,
Promotions, Discounts and Creators, and none of them have data behind them yet.

The thing that unlocks the most is **Step 7, data upload**: real GMV,
commission and ad spend per creator per brand. That is what makes My numbers
and Leaderboards possible, and it is the moment the product's whole promise
lands. Worth raising with him.

### Shapes to reuse when it is built

- **Writes go through an Edge Function**, never a table write. `manage-brand`
  and its `assert_active_staff()` gate are the template for staff work;
  `manage-offer-application` is the template for anything a CREATOR writes,
  where the role is checked per action and the row is matched on `creator_id`
  as well as its id.
- **Creator read access is gated by `is_approved_creator()`**, which reads the
  `profiles` table. Never `is_staff()`, which reads the JWT and lags approval by
  up to an hour.
- **The commercial columns stay off `brands`.** `brand_commercials` exists so a
  creator read path cannot reach a budget. Nothing creator-facing may read it.
- **Realtime** on `brands` and `offers`, with `replica identity full`. Follow
  the `useOffers` pattern: a narrow per-brand channel, never a firehose. The
  creator screens deliberately do not use it.
- **One-time moments** (a welcome, a celebration) are recorded as timestamps on
  `profiles`, never in localStorage. See `useOnboarding`.
- **Money** is `numeric`. PostgREST hands it back as a NUMBER and the Edge
  Function can return a string, so run it through `money()` or `Number()`, and
  `String()` it before it reaches a text input. Never `.trim()`.
- Offers may have a null `video_count` and null `reward_amount`, and products a
  null `price` and `commission_rate`. Every card must handle that.

Demo data: `node scripts/seed-brands.mjs` and `node scripts/seed-applications.mjs`.

**Running the suites needs a staff account.** Rashid's dev password is not
stored anywhere on disk, and it is his to type. Create a throwaway one for the
run and delete it afterwards:
`node scripts/create-admin.mjs suite-runner@wurxmediahub.test <password> admin`.

### Still parked, at Rashid's request

Prod promotion rehearsal, and email. Both raised, both deliberately deferred.
Do not start either without him asking. See PARKED.md.

## Open product decisions

- Flagship brand for the first Brand Hub (needed at Step 6).
- Leaderboard privacy default: opt-in or opt-out (Step 9).
- How payments and commission are displayed to creators (Step 8).
