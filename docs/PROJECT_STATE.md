# Project state

**Last updated:** 2026-07-29
**Current step:** Step 2, Public landing page
**Status:** Built and deployed to dev, awaiting Rashid's approval

---

## Where we are

Step 0 (setup) is approved and live on both URLs. Rashid then reordered the
roadmap: the **landing page (Step 2) is being built before auth (Step 1)**,
because he wants the homepage designed first. Step 1 comes after this.

**Prod is frozen.** Rashid's instruction on 2026-07-29: everything pushes to
`dev` only from now on. `main` stays where it is until he says "make it live".

## Done

### Step 0, Setup (approved)

- Toolchain, tokens and CLI access set up without touching Rashid's other
  project logins. Secrets in `C:\Users\RA_shid\.wurx\cli-secrets.env`.
- GitHub `RashidNazeer/WurxMediaHub` (private), `main` + `dev`.
- Supabase `wurxmediahub-dev` / `wurxmediahub-prod`, automatic RLS on,
  auto-expose off. Local project linked to dev.
- Vercel: both projects wired, env vars split per environment, each builds only
  its own branch, both URLs public.
- Design token system with `pnpm check:contrast` enforcing dark/light parity and
  WCAG AA inside the build.

### Step 2, Landing page (this step)

- Typography replaced: **Fustat** (display) + **Inter** (body). Archivo Black
  was rejected by Rashid as looking template-generated.
- Sections built: nav (with mobile menu), hero with an example "My Numbers"
  dashboard card, trusted-by brand row, headline stats, three-step how-it-works,
  six-card platform grid, closing CTA, footer.
- **Application form in the hero** (Rashid's revision): TikTok handle, email,
  niche with a conditional "Other" follow-up, worked-with-Wurx-before, and best
  1-3 video links. Real Zod validation, accessible errors. **Not connected to a
  database**, the success panel says so explicitly.
- `/apply` renders the same form standalone for direct links.
- `scripts/shots.mjs` added for retina design-review screenshots.
- `scripts/verify-page.mjs` now scrolls the page before asserting, and fails if
  any section is still invisible, scroll-reveal sections were silently blank.

### Landing page, revision 2 (weight and brand)

- Web fonts removed entirely; system font stacks instead. Saved 102 KB.
- Zod split out and lazily imported on first submit. Motion switched to
  `LazyMotion` + `domAnimation`. Initial download roughly 284 KB to 159 KB.
- Real partner logos in a pure-CSS marquee, unwrapped and downscaled from
  315 KB to roughly 50 KB. Theme-safe through blend modes, not edited images.
- Real Wurx logo in the header and footer, darkened in light mode by filter.
- Every em dash and en dash removed from the codebase, per standing instruction.

## Known bugs

None outstanding. Fixed this step: Fustat's tabular figures rendered
`$48,920` as `$48 , 920`; large display numbers now use `.wx-lining`.

## Blocked on Rashid

1. **A square icon crop of the Wurx logo** for `public/favicon.svg`, which still
   shows the older geometric gold "W" and no longer matches the header.
2. **Confirmation of the partner list.** Eight brands were taken from the
   marquee on wurxmedia.com. Rashid should confirm they are all still current
   and that none are missing.

## Next action

Wait for Rashid's review of the landing page. Then either iterate on it, or
start **Step 1, Auth and roles foundation**.

## Open product decisions

- Flagship brand for the first Brand Hub (needed at Step 6).
- Leaderboard privacy default: opt-in or opt-out (Step 9).
- How payments/commission are displayed to creators (Step 8).
- When to drop `<meta name="robots" content="noindex">` and let the landing page
  be indexed.
