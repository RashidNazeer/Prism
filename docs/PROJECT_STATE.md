# Project state

## NEXT ACTION AFTER COMPACTION

**Recorded 2026-08-19.**

Rashid is **testing the Paid Collabs header and dark mode**, just rebuilt and
deployed. Nothing else is queued: ask what he wants next and answer from
`docs/PARKED.md` if he asks what is pending.

If he comes back to Paid Collabs, the two known defects there are both in
PARKED and both **theirs, not ours**: the brand and creator tables collapse into
cards at 768px and below that show only two or three of their fields, and their
app's writes to its own `app_settings` are refused by its RLS and log a 401 and
a 42501 on every load.

**Do not re-explore the codebase to get oriented.** This file, then PARKED,
then only the files the chosen job names.

---

## The Paid Collabs header, and the theme it was stealing (2026-08-19)

Rashid: *"fix the header it's boring make it beautiful and also make sure dark
mode should work fine it seems it will break at some places such as payment
pending tag is not clear"*.

**The header is now ours.** It was the last region of the screen still wearing
WurxBase coffee-brown, because the reskin codemod rewrote their STYLESHEETS and
that bar is drawn from `style={{}}` objects in the JSX, which no sweep can
reach. It is now our card under a gold rim light, with the real Wurx mark (their
markup asks for `/wurx-logo.png`, which did not exist here until now, so what
had been rendering was their fallback tile with a W in it), the section name
against a gold rule, the app's own name demoted to a tracked-out eyebrow between
two gold hairlines, and one gold thing in the bar: the profile chip.
`src/routes/admin/wurxbase-chrome.css`, our file. Theirs is still untouched.

**The real find was underneath it.** Their `applyPrefsToDOM` writes five
attributes straight onto `<html>`, and one of them is `data-theme`, which is
the exact attribute `src/styles/tokens.css` switches our whole palette on.
Theirs defaults to `light`. So opening Paid Collabs turned the entire admin
light, and it STAYED light after leaving the screen, because our provider only
writes that attribute when the theme actually changes and nothing had changed.
`PaidCollabs.tsx` now takes the attribute back with a MutationObserver and
mirrors their other four onto the fence, where their own scoped rules read them,
so their appearance settings still work in here on everything except the theme.

**The "Payment Pending" tag** was one of three: the sweep had mapped every
status FOREGROUND onto a text token, so the fill carried the meaning and the
label carried none. They are on our three-state stage ramp now (live, due,
paid), darkened a fifth in light mode where they were 4.3:1 inside their own
wash. Same fix reached the group divider chips, one of which was painted
`--wx-on-accent` and was therefore invisible in the dark.

**Two more dark-mode holes closed**: their fifth KPI dot is hardcoded `#0A0A0A`
and was a black dot on a black card; and their daily greeting is `position:
fixed; top:72px`, which lands on their own header in here because our fence
carries a transform and is therefore the containing block. It sits at the foot
of the fence now.

**Also:** their shell was capped at 1740px and centred, against Rashid's
standing rule, and its `min-height:100vh` guaranteed a scrollbar under our top
bar. Both gone. On phones their header no longer repeats the Wurx mark our own
top bar is already showing.

**Verified by rendering it**, not by reading it: `node scripts/shots-collabs.mjs`
shoots both themes at 1440/1024/768/390, seeds their session as a **viewer** so
a run cannot write to their database, and measures page overflow. Zero
horizontal scroll at all eight combinations.


## Paid Collabs: WurxBase runs inside our admin (2026-08-18, later)

The whole WurxBase dashboard is vendored into `/admin/collabs`, sidebar item
**Paid Collabs** under Data, admin only. Brands, creators, performance,
reporting, leaderboard, discovery, with their real data.

**Their code is untouched by instruction** — Rashid: the code, features and
logic change by not one line, only the look becomes ours. `src/vendor/wurxbase/`
is verbatim; the only edits were three `.js` to `.jsx` renames because Vite will
not parse JSX out of a `.js` file.

**The reskin was a codemod**: 4,673 colours and 700 font stacks onto
`var(--wx-*)`, mapped by the property each colour sits on, so their screens now
follow our light and dark modes and our text-size control.

**Three databases, and they cannot reach each other.** `pnpm verify:isolation`
runs inside `pnpm build` and fails it if the vendored app ever names our project
or imports our client, or if our code names either of theirs. Tested by breaking
it in both directions.

**Every deleting script now refuses to run outside dev.** Twenty of them create
and remove data; seventeen used to trust whatever `.env.local` said.

### The thing that cost the most time, and it was mine

**Two deployments failed and I reported both as deployed.** I verified the push
and stopped verifying the deploy, so the 404 fix and the isolation guard sat in
git while Rashid looked at an old build and hit the same error. He found it in
the Vercel dashboard rather than from me.

The cause was a `_comment` key I had put inside `vercel.json` to explain a
rewrite. Its schema rejects unknown keys, so the deployment was rejected before
the build started — no log, duration `?`. **Never comment `vercel.json`.**

There is a local validation loop now: `vercel build` runs the real pipeline
including config validation. **And a deployment is not done until `vercel ls`
says READY.** Both in OPERATIONS.

---
## Where we are: Rashid is testing the creator numbers (2026-08-18)

**The product's central promise is live on dev.** A creator signs in and sees
the real spend, GMV, orders and ROI behind their own videos, pulled from TikTok.

| | |
| --- | --- |
| TikTok app | approved, connected on **dev only**; prod has no secrets and stays frozen |
| Ad accounts | Biomax-PX and Infirst Healthcare; **Penetrex store matched to the Penetrex brand** |
| Data | 46 real videos, ~2,800 real video-days, back to 18 April |
| Nightly job | `pg_cron` **07:00 UTC**, one call per store per day |
| Suites | 15, all green. `verify:tiktok` (37) and `verify:performance` are the new two |

**Sign in as a seeded creator** with `WurxPenetrex2026!`:
`babblingbrookej@wurxseed.test` is the interesting one, **2.75x ROI on real
money**. Also `aarontopfinds@`, `vivianiempire_@`, `pandanamonium@`, all
`@wurxseed.test`. Re-seed or remove with `scripts/seed-penetrex.mjs [--clean]`.

**The two rules that shape all of it:**

1. **Creators cannot reach TikTok at all.** A nightly job fills
   `tiktok_video_daily`; every creator screen reads that. So the date filter is
   free and unlimited, and there is no quota to get wrong.
2. **The browser never names a video.** The read functions take a date range and
   resolve ownership from `auth.uid()`, with RLS saying it again underneath.

Full detail, including every TikTok API trap, is in `FEATURE_MAP.md` under
"Creator ad numbers" and "TikTok ads connection".

**Next, once Rashid reports back:** the `Checking` state for a video added last
night that has no complete day yet — it currently reads "No ads", which is a lie
for the first day. See `PARKED.md`.

---

## The admin chrome, rebuilt to Rashid's layout (2026-08-16)

**The next job is the creator side**, which he named himself: "We can do it for
admin side only and after that we can move to creators side." See
`docs/PARKED.md` 0b.

He gave one long instruction and it is now the standing spec in CLAUDE.md and in
`FEATURE_MAP.md` "Admin screen layout". What changed:

| | before | after |
| --- | --- | --- |
| rail width | 280px, with a painted scrollbar | **225px**, no scrollbar, still scrolls |
| clicking the last menu item | snapped the list to the top | stays where you left it |
| collapse control | an arrow in the top bar | **the Wurx mark itself** |
| above the work | title row + description row, ~120px | **nothing**; the bar names the section |
| the page's `<h1>` | one per screen, repeating the menu | **one, in the bar**, underlined |
| row one | filters, laid out differently on every screen | one shared `<FilterBar>` |
| content width | capped at `max-w-7xl` | **full width** |
| type | 846 hardcoded `px` sizes | **`rem`**, on a scale the user can change |

**The section name is read from the sidebar's own labels** (`sectionTitleFor` in
`src/lib/nav.ts`), so the bar and the lit menu row cannot disagree, and
`verify:chrome` asserts they agree on nine routes.

**Text size is a control in the top bar**, four steps, persisted, and the default
is 6% smaller than the product was. It works because every size is a `rem` and
Tailwind's spacing scale is `rem` too, so padding and gaps move with the type.
Breakpoints do not move: `rem` inside a media query is always the browser's 16px.

**`pnpm verify:chrome` is the twelfth suite.** Every check in it is a bug he
found himself, and every one of them leaves a page that lays out perfectly, so
`verify:responsive` calls the lot of it healthy. Wired into `verify:all`.

---

## Navigation is instant now (2026-08-15)

The one thing Rashid said at the very start he could not tolerate, fixed and
measured rather than asserted.

| | before | after |
| --- | --- | --- |
| click to URL change, cold | **291ms**, up to 457ms | **5ms** |
| click to URL change, warm | 11ms | 9ms |

**The cause was the order, not the speed.** React Router's route level `lazy`
waits for a screen's code before it commits the navigation, so for a third of a
second nothing moved at all and it read as the app hanging. Click-to-URL and
click-to-painted were the same number, which was the whole diagnosis.

**Two changes.** The shell moved up into a layout route, so all 23 screens
stopped drawing their own `<AppShell>` and the sidebar never unmounts; then
route loading moved to `React.lazy` behind a Suspense boundary inside that
frame. Plus prefetch on `pointerenter`, `touchstart` and `focus`.

`click to painted` on a cold section is still about 500ms, because the file
still has to arrive. The point is that the app now answers immediately and fills
in behind a skeleton. **Measure it with `pnpm measure:nav [url]`**, and measure
against the LIVE url: localhost has no latency and flatters the cold figure into
meaninglessness.

## Everything runs with one command

**`pnpm verify:all [url]`** runs all eleven suites in sequence and prints one
number. 703 checks, about 12 minutes. `--only=` and `--skip=` take suite names.
**A SKIP exits non-zero**, because something that could not be checked must
never read as safety.

It exists because eleven suites with no way to run them meant they were run from
memory, and two were quietly red for days. Its first minute found three suites
that were not protecting anything.

**Run one suite at a time.** Two Chromiums on this machine push it into swap:
a full run that failed took 1313s against 721s for the green one, and the
failures were the machine rather than the code. **Re-run before believing a
failure.**

## `/precompact`, the project's first skill

`.claude/skills/precompact/SKILL.md`. Rashid types `/precompact - what he wants
next`, or `/precompact` alone, and everything needed to resume is written to
disk. The next action goes at the top of THIS file, because instructions cannot
live in a conversation that is about to be thrown away.

**Previously, last updated:** 2026-08-14

## Contest rewards: owed on confirmation, then paid (2026-08-14)

**Settlement is built, and it is not a settlement screen.** Rashid decided both
halves: a reward becomes money owed **the moment staff confirm the figure that
crosses its target**, not at the end of the contest, and the product tracks two
states, **owed then paid**.

That is why there is no "award" button anywhere. Confirming a claim writes the
bill in the same transaction, so nothing on any screen can grant a reward that
has no confirmed figure behind it.

- **`/admin/contests/rewards`**, a third item in the Contests menu. What we owe,
  oldest first, with the target and what they actually reached on every row.
  Select a run of them and mark them paid behind a confirmation that says
  plainly it cannot be undone. Paid is a second tab, the record.
- **"Close this contest"** on the setup screen, which moves no money and says
  what closing leaves owed. It refuses while a claim is still waiting, because
  that claim could never be confirmed afterwards and confirming is the only
  thing that owes anybody money.
- **The creator screen leads with Owed to you and Paid to you**, live. It used
  to compute "earned" in the browser by walking the contest's LIVE deliverables,
  which could claim money nobody owed the moment an admin added one.
- **The creator HOME shows contest money too**, in its own block beside the offer
  money and never inside it. Three things fell out of that, all real people: a
  creator with contest money was being shown the first-day screen; one with no
  offer work was being shown a hero card of zeros above the only money they have,
  which now is not drawn for them at all; and the first-day panel's hardcoded
  "Earned so far: Nothing yet" was a lie the moment it sat under a reward.
- Three creators on dev had already earned money against figures confirmed
  before a reward could exist. The migration backfilled them: **6 rewards,
  $1,400**, exactly what confirming those same figures today would produce.

**`pnpm verify:contests` is at 121 checks, up from 36**, and the creator side is
finally in it: the contest screen, the entry dialog and the progress dialog are
all driven in a real browser, then the whole money path end to end, then sixteen
attacks including a rival creator who can read none of it.

**Every realtime hook now goes through `joinChannel`.** The last eight moved on
2026-08-14, so nothing in the product calls `supabase.channel()` itself and the
crash class is closed. Three subscriptions to identical rows became one, and
`useCatalogueLive` lost the `key` argument that existed only to work around it.

## Contests, built on 2026-08-13 and 14

Live on dev, end to end, and testable now.

**A contest is a list of DELIVERABLES.** Each one is a type, a target and a
reward. Two types, `gmv` and `video_count`, and the enum is written so a third
is one line. Add as many as you like. Placings were dropped: anybody who reaches
a target earns its reward and several creators can earn the same one.

**Progress is typed by the creator and confirmed by staff.** Cumulative totals,
never increments. The target is read only to them in the browser AND on the
wire. Filing a claim asks for exactly the NEW videos, so five to six asks for
one link and one ad code, not six. The count may not go backwards. NOTHING
COUNTS UNTIL STAFF CONFIRM IT, because a creator typing their own GMV is a
creator typing their own payslip.

**Where they stand, without names.** `my_contest_standing` returns only the
caller's own position, derived from `auth.uid()` with no user id argument. A
creator learns they are 2nd closest of 5 and nothing about who the others are.
This AMENDS decision D7, and Rashid confirmed the amendment on 2026-08-13.

Screens: `/admin/contests` (what is running), `/admin/contests/claims` (who is
waiting on us), the Contests tab inside a brand, the full screen setup form at
`/admin/brands/:id/contests/:contestId`, and `/app/contests` with two views, the
list and the creator's own dashboard.

`pnpm verify:contests` drives the real admin screens then attacks the same data
as a real signed in creator. `pnpm seed:contests` puts five creators in a
contest with uneven figures, `--clean` removes them.

**Read [CONTESTS_PLAN.md](CONTESTS_PLAN.md) before touching any of it.** It
holds the numbered rules, and several were learned the hard way in one night.

Still to build: **real tracking**, which waits on the performance tracking
conversation Rashid has parked. Settlement is done, see the section above.

**Previously, last updated:** 2026-08-11
**Current step:** joining the product up, steps 1 and 2 of 8 are built. A job
says how much of it has been filmed, on both sides.
**Next:** Rashid is testing 1 and 2 together. The remaining ADMIN work is steps
5 to 8 of `UI_CONNECTIONS_PLAN.md` (a brand's money and content split, the
brand's Creators tab, a per-creator screen, and the operations home). Steps 3
and 4 are creator side. Await his word on which.
**Status:** Everything below is built, tested and on `dev`.

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

- **A creator asks for an offer exactly as it is written.** Countering it with
  their own price shipped and was withdrawn the same day on Rashid's call. See
  DECISIONS; nothing can write the two proposal columns any more, and they were
  kept only so requests made during that window still read truthfully.
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

### Step 6, Brand Hub phase four (this step)

Two dashboards that cut across brands, one each side.

- **`/admin/offers`, every offer we run.** Live or switched off, which brand,
  the deal, how many creators are on it and how many are waiting. Search,
  filter by brand, filter by whether it needs applying for, sort by newest,
  oldest or highest paying, paginated in the database. The waiting count links
  straight into the request queue for that brand.
- An offer nobody has to apply for says **"Open to everyone"** instead of a
  creator count. It belongs to the whole roster and there is no row to count,
  so a zero there would read as nobody wanting it.
- **The request queue moved to `/admin/offers/requests`.** The sidebar now has
  an Offers group holding both, because they are different jobs.
- **`/app/offers`, every offer open to a creator**, from every brand they work
  with. Tabs for everything, you are in, waiting, and not asked yet, each with
  a count. Search across offer, brand and description, and a brand filter. They
  can apply straight from here, using the same dialog as the hub.
- `pnpm verify:offer-requests`: 50 checks, now including both dashboards.

### Step 6, Brand Hub phase five (this step)

Budgets that move when you approve somebody.

- **Approving a creator charges the offer's price to that brand's budget**, and
  only that brand's. Rashid's example: Bentgo allocated $1,000, two creators
  approved on a $100 and a $200 offer, so $300 used and $700 left.
- What was promised is **snapshotted onto the request** (`committed_amount`), so
  re-pricing the offer later does not rewrite a promise already made, or a
  budget already reported on.
- **Every brand card carries a budget bar**: how much is committed, how much is
  left, gold under 80%, amber over it, red past 100%.
- **The brand list can be filtered by how much is gone**: under 50%, 50 to 80%,
  over 80%, over budget, or no budget set. Filtered in the database on a stored
  generated column, so it works with pagination.
- The brand's own Overview leads with the same bar, and the approve dialog says
  what a decision will cost and what will be left **before** it is made.
- **Going over budget is allowed and shown, never blocked.** That is a
  commercial call, not one for the software to make at eleven at night.
- All of it is staff only. It lives in `brand_commercials`, which no creator
  can read, and the suite proves that on the wire.
- `pnpm verify:offer-requests`: 61 checks.

### Step 6, Brand Hub phase six (this step)

The pipeline, and the creator's real dashboard.

- **Seven stages on every approved offer**, in Rashid's own words: Pending
  request, Sample requested, Sample shipped, Content pending, Content
  completed, Payment pending, Paid. The same labels on both sides, so a phone
  call between an admin and a creator uses one vocabulary.
- Staff move a request along from the queue, with a stage filter alongside.
  Approving picks the starting stage, because a sample already in the post is a
  real situation.
- **Every move is recorded and the creator can read their own history.** That is
  a separate table from `audit_log`, which is staff only.
- **`/app` is now a real dashboard.** Paid to you so far as the headline, a
  flow bar splitting every agreed pound into paid, awaiting payment and in
  progress, four counts, every piece of work with a seven-step tracker and what
  it pays, and a timeline of the latest moves.
- **Money is bucketed by stage, not status**, so the three cards always add up
  to the total agreed.
- All of it is live. An admin marking a sample shipped or a payment made lands
  on the creator's screen with no refresh.
- A creator can now always read the offer and brand behind their own work, even
  after either is switched off. Without that, retiring a brand would blank the
  name of the thing somebody is still owed for.
- `pnpm verify:offer-requests`: 73 checks.

**Not built, by design:** the actual videos. An approved request at "content
completed" says a creator delivered; which posts those were, and what they
earned in GMV, is Step 7 and Step 8 work.

### UI polish, phase one: the creator home (this step)

Built from a standalone design Rashid approved and asked for pixel for pixel.

- **The whole screen is new**: an eyebrow that says the connection is live, a
  greeting, one money card carrying the total agreed, what has landed, a flow
  bar and three tinted cells, then the work list and the timeline side by side
  with the four counters under them.
- **The pipeline is finally felt.** An admin moving somebody's work now flashes
  that card, bumps the figures it changed and pops a new "just now" line into
  the timeline. It always arrived live; nothing on screen ever said so.
- **Three money colours of their own**, indigo, amber and green, replacing the
  borrowed accent/warning/success that collide in light mode. All three were
  darkened from the design until they clear WCAG AA on the tightest surface
  they sit on, and `check-contrast` now enforces exactly that.
- **The surfaces were retuned** to the design's warmer near-black and paper,
  globally, because the sidebar sits against these cards. The brand gold, the
  landing page and the admin panel are otherwise untouched.
- **Two self-hosted variable fonts**, Instrument Sans and Sora, scoped to
  signed-in screens so the public page still downloads nothing.
- **A real first-day screen**: approved, nothing taken, with all seven stages
  laid out and the first few offers to take. Lazily loaded, because it pulls
  the apply dialog and the Zod chunk behind it.
- `pnpm shots:creator` builds a creator with a full pipeline, photographs the
  home in both themes at 375/768/1024/1440, and removes the account again.
- `pnpm verify:responsive`: 162 checks, all green. It earned its keep here: the
  first-day import cost was a real 375px regression and this suite found it.

### Creator UI rebuilt from an approved design (2026-08-10 to 11)

- A UI agent brief (`docs/UI_BRIEF_CREATOR.md`) went out, came back, and the
  design was approved pixel for pixel. The SECOND brief is the one that worked:
  the first described our own screens in such detail the agent just repainted
  them.
- **Surfaces retuned, type replaced.** Instrument Sans and Sora, self hosted,
  scoped to `.wx-app` so the landing page payload is unchanged. Three new stage
  colour tokens. New motion utilities. All of it passes the contrast guard in
  both themes.
- **`/app` has two views**, Overview and Pipeline, both from the design, chosen
  in the URL. Pipeline is the first thing to read `summary.byStage`, which had
  been computed since the pipeline shipped with nothing using it.
- Offers, Brand hubs, a Brand Hub and Profile brought onto the same language.
  `StageTracker` now draws the same seven bars the home screen does, so one job
  cannot look like two different facts on two screens.
- **Bug found and fixed:** `stateFor` checked `needs_application` before the
  creator's own request, so an admin switching that off hid the stage, the
  tracker and the money of somebody already working on it. Live work wins now.
- `scripts/shots-creator.mjs` photographs a logged-in creator with a full
  pipeline. `pnpm verify:responsive` is at 186 checks.

### The catalogue is live too (2026-08-11)

- A creator's own requests were always live; the things an ADMIN edits were
  not. Renaming an offer, re-pricing it, retiring a brand or adding a product
  left every creator on the old version. `useCatalogueLive` fixes it with one
  channel over brands, offers and `brand_products`.
- **`pnpm verify:live`**, 13 checks, and the first suite to drive the ADMIN
  SCREEN rather than the database: staff move a stage, all three creator screens
  must follow with no reload.

### Step 7, Content (2026-08-11)

- `content_submissions`: a creator posts a video LINK and its ad code against
  one approved job. We never hold a file.
- **Approval is what counts.** Only approved submissions count towards an offer,
  and `review_content` is the only thing in the product that can carry a job to
  `content_completed`, in the same transaction. Uploading advances nothing.
  Rashid's call.
- `manage-content` Edge Function, role checked per action, no insert/update/
  delete policy on the table at all. Creators can edit until it is approved.
- **`/app/content`** and **`/admin/content`**, both split into Submissions and
  Dashboard, both landing on Submissions. Thumbnails and an in-page player from
  TikTok oEmbed, fetched server side.
- **Known limit:** oEmbed is unauthenticated and rate limited, so a thumbnail is
  best effort. Every card is designed to look right without one and playback
  never depends on it, the video id is read out of the link.
- `pnpm verify:content`: 26 checks, nine of them attacks.

### Joining the product up, step 1: a job says how much of it has been filmed (2026-08-11)

Rashid's brief: the menu items each have their own data and there is no close
connection between them, a creator who posts content should see it against the
offer. A 12-agent audit of every screen produced
**[UI_CONNECTIONS_PLAN.md](UI_CONNECTIONS_PLAN.md)**, eight steps. This is one.

- **The number was already being computed and shown on one screen out of nine.**
  `progressFor()` lived in the browser and two files imported it. It is now the
  `job_progress` VIEW, the project's first, and five screens read it: the home
  screen in both views, the offers list, the brand hub, My content and the add
  a video dialog.
- **The deal freezes at approval.** `committed_video_count` joins
  `committed_amount`. Re-scoping an offer no longer moves the goalposts on
  somebody already filming, and the offer card shows the deal THEY were given.
- **Every screen that says "one still to film" now has an Add a video button**,
  which lands on `/app/content?job=<id>` with the dialog already open on that
  job. Before this the number would have been a dead end.
- **Two ways a job could get stuck, both fixed and both proven on real data.**
  Approving the last video only finished a job from two of the seven stages, so
  one already on dev was sitting at 3 of 3 approved and "pending request" with
  nothing that could ever fix it. And un-approving a video left a job marked
  finished with a video missing; it now walks back and tells the creator why.
- **The false line is gone.** The brand hub told creators of an open offer to
  "start posting whenever you are ready" when there was nowhere to post.
- **The offer card was written out twice** and had drifted. One card now.
- **Creator code can no longer import admin code, or the reverse.** It is a
  build failure, not a convention, and it caught three real violations the hour
  it went in, including the admin content screen importing a creator screen.
- `node scripts/seed-pipeline.mjs` fills dev's approved jobs with videos in five
  states, through the real review function.
- `pnpm verify:content`: 33 checks, up from 26. The new ones prove a rival
  creator gets nothing from the view, that it carries no budget column, that
  re-scoping does not move an agreed job, and both stuck-job fixes.

### Joining the product up, step 2: the admin side of the same join (2026-08-11)

- **The requests queue was quoting the wrong money and now does not.** It
  fetched what was agreed at approval and then rendered the offer's price today.
  Re-price an offer and the queue, the brand's budget and the creator's own
  dashboard gave two answers about one promise. A pending row still shows the
  offer's live terms, which is genuinely what is being asked for.
- **Each approved row now carries the same progress bar the creator sees**, how
  long the job has stood where it is (amber past a fortnight), the last move
  made on it in the words the creator was given, and a link to their videos.
- **The admin content screen says who filmed it and how much of their job it
  is.** A reviewer had a brand, an offer title and an ad code, on a screen whose
  search box searches by handle.
- **The Approve button says when this is the last one**, because approving it
  finishes the job and moves the creator on. A label, not a confirm step:
  reviewing at speed was deliberate. Afterwards it says what the decision
  actually did, which the database has always returned and the screen discarded.
- **The catalogue stopped hiding live work.** It skipped any offer whose
  needs-application flag was off, so switching that flag on an offer six people
  were mid-pipeline on erased all six from the screen. It now asks about every
  offer and decides on what comes back. Each row also shows videos in and how
  many are waiting to be watched.
- **All three screens are on the current design language**, which is why they no
  longer sit a generation behind the creator side.
- No migration needed: every new read rides an index that already existed, two
  of which had never been used by a query.

### Joining the product up, steps 5 to 8: the rest of the admin side (2026-08-11)

- **A brand's Overview says where its money and its content have got to.** The
  committed figure splits into paid, awaiting payment and in progress, one block
  PER CURRENCY, and a card says how many videos have landed, are waiting to be
  watched, and were sent back.
- **The Offers tab is paged, searchable and filterable.** It used to fetch every
  offer a brand owns in one unbounded read, which was also what Overview counted
  from, so those counts moved into the database in the same step or they would
  have quietly started describing the first twelve rows.
- **The Creators tab is built**, after weeks of being advertised as "Later".
  One card per person who has ever asked for one of that brand's offers: where
  they stand, what was agreed, what has been paid, what they have delivered.
  Tabs, search and paging all in the database.
- **`/admin/creators` and `/admin/creators/:id` exist.** There was a screen for
  every entity in the product except a person. It opens on their WORK, with
  tabs for history and account, and the application screen gains a link across
  rather than pretending to be the person.
- **The admin home reads all three queues.** It could say "the queue is clear"
  while nine creators sat unanswered and forty videos sat unwatched. It now
  leads with what is waiting on us, then what is waiting on creators, then money
  across every brand, then what is at risk, and every number is a link into the
  screen already filtered for it.
- **Three defects in the activity log fixed:** it never selected `subject_type`,
  so every row linked to the applications screen whatever it was about; its
  filter skipped the leading column of its own index, so a per-record history
  was a sequential scan; and its label regex could not strip a namespace with an
  underscore, so eleven actions printed as "offer application.stage changed".
- **Four new views**, all `security_invoker` AND gated on `is_staff()` in the
  body. `job_progress` is safe to share with creators because a job belongs to
  one person; these group by brand or list every person, where a creator would
  get a plausible narrowed answer instead of an error.

## Known bugs

None outstanding.

## Parked work

Everything we have consciously deferred lives in **[PARKED.md](PARKED.md)**.
When Rashid asks "what's pending?", answer from that file. Do not duplicate the
list here.

## Next action

**Rashid is testing all eight steps of `UI_CONNECTIONS_PLAN.md` end to end.
Wait for his report. A bug he finds becomes the current step.**

Nothing is blocked and there is no half-finished work.

### What is on dev now, as of 2026-08-14

The clean slate below is no longer the whole picture. Dev currently carries:

- **`rashid@wurxmedia.com`**, admin, the only account that is not test data.
- **Four brands with offers and products**, from `seed-brands.mjs`.
- **Five contest creators** (`*@wurxmediahub.contest`) in "Back to School" on
  Bentgo with uneven figures, from `seed-contests.mjs`. Three of them are owed
  real contest money: $850, $350 and $200.
- **Seven demo applicants** (`*@wurxmediahub.demo`) sitting in the review queue,
  from `seed-applications.mjs`, put back on 2026-08-14 at Rashid's word.
  `pnpm verify:responsive` signs in as `skinbyamara@wurxmediahub.demo` and had
  been silently unrunnable without it since the wipe.

Each of those three seeds takes `--clean` and removes exactly what it made.

**`seed-pipeline.mjs` was run and correctly wrote nothing.** It only puts videos
against jobs that are ALREADY approved, and dev has one, whose turn in its cycle
is "nothing posted yet". A rich pipeline needs creators approved onto offers
first, which no seed does; `check-offer-requests` builds that state and takes it
away again.

### The clean slate this replaced, from 2026-08-12

He asked for a clean slate to test the whole flow from the beginning. Deleted:
every creator and applicant account, 12 applications, 5 brands, 8 offers, 8
products, 6 requests, 13 stage events, 18 videos and 141 audit rows. The
`brand-assets` bucket was already empty.

**Exactly one account survives: `rashid@wurxmedia.com`, admin, active.** His
password is not written down anywhere, by design, and is his to type.

Consequences to expect, and NOT to report as bugs:

- Every screen shows its empty state rather than its numbers. The brand Creators
  tab says nobody has asked yet, `/admin/creators` says no creators yet, and the
  money blocks are absent rather than showing zeros. That is deliberate.
- The joined-up work only becomes visible once a creator has been walked all the
  way through a job. Until then there is nothing to join up.
- Any suite needing `ADMIN_EMAIL` must make its own throwaway account, as
  OPERATIONS already says. Do not point one at his admin.

To fill it again: `node scripts/seed-brands.mjs` then
`node scripts/seed-pipeline.mjs`. Both take `--clean`. Ask first; he may want it
empty.

### The junk test data is gone

The offer titled `55` with badge `55555`, and the Pay-per-video offer whose
description said $50 a video while its reward was $12, went with the reset.
Nothing left to clean.

### The design language, which is now settled

It came from a UI agent brief Rashid approved (`docs/UI_BRIEF_CREATOR.md`) and
is all in the code already. Copy an existing creator screen rather than
inventing:

- **Type:** Sora (`font-display`) for headings and every figure, Instrument
  Sans for the rest. Both self hosted in `public/fonts`, switched on by
  `.wx-app` on the AppShell so the landing page still ships system fonts.
- **Eyebrows** are sans, `text-[11px] font-semibold tracking-[0.14em] uppercase`
  in `text-muted`. NOT `font-mono`, which is what the old screens use.
- **Cards** are `rounded-[20px]` (or `[22px]` for a hero block) with
  `shadow-md`. Skeletons are `wx-skeleton`, never `animate-pulse`.
- **The three stage colours** `--wx-stage-live` / `-due` / `-paid` are the only
  things allowed to say where money or work has got to. See tokens.css for why
  they are not accent/warning/success.
- **Live motion:** `wx-pop`, `wx-bump`, `wx-flash`, `wx-blink`. A stage moving
  under somebody has to be felt, not just redrawn.

### Two habits Rashid has now asked for twice

- **The default section is the JOB, not the summary.** Both Content screens and
  the creator home land on the work, with the dashboard one click across in a
  segmented switch whose choice lives in the URL. Do this for any new screen
  that grows a summary.
- **When a design has more than one direction or state, build them all**, or
  say plainly which one was skipped. Direction B of the home screen was left out
  and not mentioned, and he found it himself. That cost trust, not just time.

### Every screen that exists, and who sees it

Public: `/` landing, `/apply` and `/signup` (same screen), `/login`,
`/admin/login`, `/forgot-password`, `/reset-password`, `/suspended`, 404.

Admin: `/admin` dashboard, `/admin/applications` and `/admin/applications/:id`,
`/admin/activity`, `/admin/offers`, `/admin/offers/requests`,
`/admin/content`, `/admin/brands`, `/admin/brands/:id` (tabs: Offers, Overview,
About, **Creators**), **`/admin/creators`** and **`/admin/creators/:id`**.

Creator: `/app` (Overview and Pipeline views), `/app/offers`, `/app/brands`,
`/app/brands/:slug`, **`/app/content`**, `/app/profile`.

Studio: `/studio` placeholder only.

### Housekeeping worth one commit of its own

- The repo is still not prettier-clean overall. Every file touched between
  2026-08-11 and 12 was formatted, but the rest were not, so `pnpm format`
  would still rewrite a lot, mostly Tailwind class ordering. One commit,
  nothing else in it.
- There is no `src/types/database.ts`. CLAUDE.md prescribes
  `supabase gen types typescript --linked > src/types/database.ts` and it has
  never been run, so every hook ends in `as unknown as Row[]` and a renamed
  column compiles clean and fails in the browser. That now covers FIVE views as
  well as the tables. Worth doing before the next schema change.

### Still parked, at Rashid's request

Prod promotion rehearsal, and email. Both raised, both deliberately deferred.
Do not start either without him asking. See PARKED.md.

## Open product decisions

- Flagship brand for the first Brand Hub (needed at Step 6).
- Leaderboard privacy default: opt-in or opt-out (Step 9).
- How payments and commission are displayed to creators (Step 8).
