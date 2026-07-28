# Project state

**Last updated:** 2026-07-29
**Current step:** Step 2 — Public landing page
**Status:** Built and deployed to dev, awaiting Rashid's approval

---

## Where we are

Step 0 (setup) is approved and live on both URLs. Rashid then reordered the
roadmap: the **landing page (Step 2) is being built before auth (Step 1)**,
because he wants the homepage designed first. Step 1 comes after this.

**Prod is frozen.** Rashid's instruction on 2026-07-29: everything pushes to
`dev` only from now on. `main` stays where it is until he says "make it live".

## Done

### Step 0 — Setup (approved)

- Toolchain, tokens and CLI access set up without touching Rashid's other
  project logins. Secrets in `C:\Users\RA_shid\.wurx\cli-secrets.env`.
- GitHub `RashidNazeer/WurxMediaHub` (private), `main` + `dev`.
- Supabase `wurxmediahub-dev` / `wurxmediahub-prod`, automatic RLS on,
  auto-expose off. Local project linked to dev.
- Vercel: both projects wired, env vars split per environment, each builds only
  its own branch, both URLs public.
- Design token system with `pnpm check:contrast` enforcing dark/light parity and
  WCAG AA inside the build.

### Step 2 — Landing page (this step)

- Typography replaced: **Fustat** (display) + **Inter** (body). Archivo Black
  was rejected by Rashid as looking template-generated.
- Sections built: nav (with mobile menu), hero with an example "My Numbers"
  dashboard card, trusted-by brand row, headline stats, three-step how-it-works,
  six-card platform grid, closing CTA, footer.
- `/apply` placeholder route so no call to action is a dead link.
- `scripts/shots.mjs` added for retina design-review screenshots.
- `scripts/verify-page.mjs` now scrolls the page before asserting, and fails if
  any section is still invisible — scroll-reveal sections were silently blank.

## Known bugs

None outstanding. Fixed this step: Fustat's tabular figures rendered
`$48,920` as `$48 , 920`; large display numbers now use `.wx-lining`.

## Blocked on Rashid

1. **Real brand list for the "Trusted by" row.** `src/content/site.ts` currently
   holds six obvious placeholders (`Brand One`…`Brand Six`). Needs real names,
   and ideally SVG logos.
2. **The real Wurx logo.** Placeholder mark in
   `src/components/brand/WurxMark.tsx` + `public/favicon.svg`.

## Next action

Wait for Rashid's review of the landing page. Then either iterate on it, or
start **Step 1 — Auth and roles foundation**.

## Open product decisions

- Flagship brand for the first Brand Hub (needed at Step 6).
- Leaderboard privacy default: opt-in or opt-out (Step 9).
- How payments/commission are displayed to creators (Step 8).
- When to drop `<meta name="robots" content="noindex">` and let the landing page
  be indexed.
