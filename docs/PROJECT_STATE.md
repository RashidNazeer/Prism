# Project state

**Last updated:** 2026-07-29
**Current step:** Step 3, application flow (Steps 1 and 3 now merged, since
applying creates the account)
**Status:** Built and deployed to dev, awaiting Rashid's approval

---

## Where we are

Step 0 (setup) approved. Step 2 (landing page) built and revised twice. Rashid
reordered the roadmap so the landing page came before auth; auth is now done.

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

## Known bugs

None outstanding.

## Parked work

Everything we have consciously deferred lives in **[PARKED.md](PARKED.md)**.
When Rashid asks "what's pending?", answer from that file. Do not duplicate the
list here.

## Next action

**Step 4, the admin panel.** Approved by Rashid on 2026-07-29. Build:

1. A review queue at `/admin`: paginated list of applications, newest or oldest
   first, filterable by status and by `worked_with_wurx` (Rashid cares about
   fast-tracking people Wurx already knows).
2. An application detail view showing everything they submitted.
3. Approve and reject actions. Approving sets `profiles.role = 'creator'`,
   assigns a tier, and sets `applications.status`. Rejecting records an optional
   note.
4. These run through a **Supabase Edge Function** that re-checks the caller is
   admin or ops server side. RLS already blocks the applicant; the Edge Function
   is the defence in depth the brief asks for on anything touching approvals.
5. An `audit_log` table: who did what, to whom, when. Required by the brief for
   sensitive admin actions.
6. The applicant's screen must update **live** when a decision is made. The
   realtime plumbing already exists and is tested (`useApplication`).
7. Pagination and indexes from the start. Never load every application.

Admin account for testing already exists: `rashid@wurxmedia.com`.

## Open product decisions

- Flagship brand for the first Brand Hub (needed at Step 6).
- Leaderboard privacy default: opt-in or opt-out (Step 9).
- How payments and commission are displayed to creators (Step 8).
