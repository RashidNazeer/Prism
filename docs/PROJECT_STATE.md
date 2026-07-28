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

- Vercel wired up: both projects connected to the repo, framework `vite`,
  per-project Ignored Build Step so each builds only its own branch, env vars
  set (dev project -> dev database, prod project -> prod database),
  `wurxmediahubdev.vercel.app` pinned to the `dev` branch, and Vercel
  Authentication disabled so both URLs are publicly reachable.

## Known bugs

None outstanding. One resolved during setup: every Vercel deploy came back
`BLOCKED` because commits were authored with Rashid's personal email, which
GitHub maps to a different account (`TSRashid`) than the repo owner
(`RashidNazeer`). Fixed by switching the commit identity to the GitHub no-reply
address — see DECISIONS.

## Blocked on Rashid

1. The real Wurx logo file. A typographic placeholder mark is in use
   (`src/components/brand/WurxMark.tsx`); swapping it touches only that file
   plus `public/favicon.svg`.

## Next action

Confirm both URLs serve the shell, then hand Rashid the test checklist and wait
for approval before starting **Step 1 — Auth and roles foundation**.

## Open product decisions (ask when the step needs them, not before)

- Flagship brand for the first Brand Hub (needed at Step 6).
- Whether the public landing page shows real platform stats (Step 2).
- Leaderboard privacy default: opt-in or opt-out (Step 9).
- How payments/commission are displayed to creators (Step 8).
