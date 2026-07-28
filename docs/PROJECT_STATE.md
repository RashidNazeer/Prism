# Project state

**Last updated:** 2026-07-28
**Current step:** Step 0 — Setup
**Status:** Built and awaiting Rashid's approval

---

## Where we are

Step 0 of the Phase 1 roadmap. The repo, both Supabase projects, the app
scaffold and the public "coming soon" shell exist. Vercel wiring is the last
piece and is blocked on a token from Rashid.

## Done

- Toolchain verified on Rashid's Windows machine; installed `gh` 2.96 and
  `pnpm` 11.17 (git, node 24, supabase 2.105, vercel 54.9 were already present).
- Token-based CLI access set up so no existing browser login is disturbed.
  Secrets live in `C:\Users\RA_shid\.wurx\cli-secrets.env`, outside the repo.
- GitHub repo `RashidNazeer/WurxMediaHub` (private) with `main` and `dev`.
- Supabase projects `wurxmediahub-dev` and `wurxmediahub-prod` created in the
  Wurx Media org, us-east-1, with automatic RLS ON and auto-expose OFF.
- App scaffolded: React 19, Vite 8, TypeScript 6 strict, Tailwind v4,
  TanStack Query, React Router (lazy routes), Motion, Zod, Supabase client.
- Design tokens built from the wurxmedia.com palette, dark + light, with
  `scripts/check-contrast.mjs` enforcing parity and WCAG AA inside `pnpm build`.
- Coming-soon shell with anti-flash theme switching and a working theme toggle.
- Local project linked to `wurxmediahub-dev`; `.env.local` holds the dev URL and
  publishable key (gitignored).
- Browser-verified in real Chromium: zero console errors, correct colours in
  both themes, toggle persists across reload, no horizontal scroll at 375 /
  393 / 768 / 1440, 404 route renders.
- Both branches pushed. Git auth locked to the scoped token (negative-tested).
- Memory docs created (this file, FEATURE_MAP, DECISIONS, CLAUDE.md).

## In progress

- Vercel: both projects need to be imported from the repo by Rashid, then
  configured via CLI (production branch, env vars, first deploy).

## Known bugs

None.

## Blocked on Rashid

1. `VERCEL_TOKEN` in the secrets file (still empty).
2. Import the repo twice at vercel.com/new as `wurxmediahub` and
   `wurxmediahubdev` — the GitHub App approval cannot be done from a CLI.
3. The real Wurx logo file. A typographic placeholder mark is in use
   (`src/components/brand/WurxMark.tsx`); swapping it touches only that file.

## Next action

Once the Vercel token lands: set the dev project's production branch to `dev`,
push the Supabase URL + anon key into each project's env vars, deploy both, and
report the two URLs with a test checklist. Then wait for approval before
starting **Step 1 — Auth and roles foundation**.

## Open product decisions (ask when the step needs them, not before)

- Flagship brand for the first Brand Hub (needed at Step 6).
- Whether the public landing page shows real platform stats (Step 2).
- Leaderboard privacy default: opt-in or opt-out (Step 9).
- How payments/commission are displayed to creators (Step 8).
