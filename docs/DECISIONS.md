# Decisions

Dated one-liners. Why, not just what. Newest at the bottom.

---

- 2026-07-28: Stack locked by Rashid — React + Vite + TS strict, Tailwind +
  shadcn/ui, TanStack Query, React Router, Supabase only, Vercel, pnpm. No
  Next.js (his previous Next builds felt slow).
- 2026-07-28: Claude drives all CLIs with scoped tokens from
  `C:\Users\RA_shid\.wurx\cli-secrets.env`, never `*/login` commands — Rashid
  has another project signed in on GitHub/Supabase/Vercel and it must not be
  disturbed. GitHub uses a fine-grained token locked to this one repo; Vercel
  and Supabase tokens are account-wide because neither offers per-project
  tokens (Rashid accepted this, both set to expire in 90 days).
- 2026-07-28: Two Supabase projects in a dedicated "Wurx Media" org rather than
  one project with two schemas — "prod is sacred" is only real if prod is a
  separate database.
- 2026-07-28: Supabase project settings — `Enable automatic RLS` ON (forces RLS
  on every new table, matching our deny-by-default rule) and `Automatically
  expose new tables` OFF (grants are explicit per table, in the migration).
  Both projects configured identically.
- 2026-07-28: Brand palette taken from wurxmedia.com's own stylesheet rather
  than invented — near-black `#0a0a0a`, gold `#c8924b`, cream `#f5efe1`,
  Archivo Black / Inter / JetBrains Mono.
- 2026-07-28: Light mode uses a darkened gold `#8a5f1f` instead of the brand
  `#c8924b`. The brand gold is only 2.58:1 on a light background — it would
  have been unreadable. Dark mode keeps the true brand gold at 7.23:1.
- 2026-07-28: `scripts/check-contrast.mjs` runs inside `pnpm build` and fails
  the build on (a) a token defined in one theme but not the other, or (b) any
  text/background pair below WCAG AA. Rashid's standing instruction: dark and
  light must never mismatch, so it is enforced mechanically rather than by
  memory.
- 2026-07-28: `noPropertyAccessFromIndexSignature` deliberately NOT enabled
  despite otherwise-strict TypeScript. It forces `import.meta.env['VITE_X']`,
  and Vite only statically replaces the dot form — the bracket form would
  silently be `undefined` in production.
- 2026-07-28: Use Supabase's new **publishable** key (`sb_publishable_...`) via
  `VITE_SUPABASE_PUBLISHABLE_KEY`, not the legacy `eyJ...` anon JWT. Both were
  tested live against `/auth/v1/settings` and both return 200, but the legacy
  keys are on Supabase's deprecation path and this product is meant to run for
  years. Swapping back is a one-line env change if anything ever needs it.
- 2026-07-28: Git in this repo uses a local credential helper that reads
  `GH_TOKEN` from the environment, with an empty helper entry ahead of it to
  reset the inherited Windows Credential Manager. Verified by negative test: an
  invalid token now fails the push instead of silently falling back to Rashid's
  stored GitHub login.
- 2026-07-28: Playwright added as a dev dependency. Rashid cannot debug in a
  console, so "zero console errors" has to be machine-verified; section 11's
  auth-stability tests (idle refresh, two tabs, refresh mid-form) will need it
  too.
- 2026-07-29: Git commit identity is
  `286085480+RashidNazeer@users.noreply.github.com`, not Rashid's personal
  email. GitHub maps that personal email to a *different* account (`TSRashid`),
  and Vercel's Hobby plan BLOCKS any deployment whose commit author it cannot
  match to the connected account — every deploy failed with state `BLOCKED`
  until this was corrected. Do not change `user.email` in this repo.
- 2026-07-29: Both Vercel projects build from the one repo, so each has an
  Ignored Build Step so it only builds its own branch (`wurxmediahub` -> `main`,
  `wurxmediahubdev` -> `dev`). Without it every push built twice.
- 2026-07-29: `wurxmediahubdev.vercel.app` is pinned to the `dev` git branch via
  the domains API. Vercel's public API does not expose the "Production Branch"
  setting, so this is the CLI-drivable equivalent and avoids sending Rashid back
  to the dashboard.
- 2026-07-29: Vercel Authentication (`ssoProtection`) turned OFF on both
  projects. It defaulted to `all_except_custom_domains`, which would have put
  both `.vercel.app` URLs behind a Vercel login — Rashid could not have tested
  them, and the public landing page must be reachable. The shell ships with
  `<meta name="robots" content="noindex">`. Say the word and dev goes back
  behind protection.
- 2026-07-29: Roadmap reordered by Rashid — the public landing page (Step 2) is
  built before auth (Step 1). Auth follows.
- 2026-07-29: Prod frozen. Everything pushes to `dev` only until Rashid says
  "make it live". `main` is not to be touched.
- 2026-07-29: Display font changed from **Archivo Black** to **Fustat**. Rashid
  rejected Archivo Black as looking AI-generated. He pointed at medialabs-co.com
  as the reference; their stylesheet was read directly and uses
  `h1..h4 { font-family: Fustat; font-weight: 700; letter-spacing: -0.02em;
  line-height: 1.08 }` with Inter for body. We adopted the same recipe, applied
  once in global.css rather than per component. Archivo Black is a poster face —
  at 5rem it reads as a template, which is exactly what Rashid objected to.
- 2026-07-29: The hero carries an example "My Numbers" dashboard card. A hero
  that is text-only with a large empty right side is the clearest tell of a
  generated page, and the product's whole pitch is "you get a dashboard, not a
  screenshot" — so showing it beats describing it. The card is labelled
  **Example** and uses invented figures; it must never be presented as a real
  creator's data.
- 2026-07-29: Landing page marketing numbers (100M+ revenue, 5K+ creators,
  2B+ views) supplied and confirmed by Rashid. The "Official TikTok Partner"
  claim from the MediaLabs reference was deliberately NOT copied — Rashid
  confirmed Wurx is not one.
- 2026-07-29: Brand logos in `src/content/site.ts` are placeholders and flagged
  as such in the file. Real partner names were not invented.
- 2026-07-29: Large display numbers use `.wx-lining`, not `.wx-numeric`. Fustat
  renders the tabular comma at full digit width, so tabular figures turned
  `$48,920` into `$48 , 920`. Tabular is still correct for leaderboards and data
  tables where digits must align between rows.
- 2026-07-29: `MotionConfig reducedMotion="user"` wraps the app. The
  prefers-reduced-motion media query in global.css only governs CSS
  transitions; Motion animates in JavaScript and would otherwise ignore it.
- 2026-07-29: The hero right column is the application form, not the example
  dashboard card. Rashid's call — the form is the conversion point, so it goes
  above the fold. `NumbersPreview.tsx` was deleted; it is in git history and can
  come back into the Platform section if wanted.
- 2026-07-29: Hero now has ONE secondary button ("See how it works", size xl).
  "Apply to join" was removed because the form is right there; every other Apply
  CTA on the page scrolls to `#apply` instead of routing away.
- 2026-07-29: `/apply` still exists as a standalone route rendering the SAME
  `<ApplyForm />`, so a direct link from a DM or email lands somewhere focused.
  One form component, two placements — never two copies.
- 2026-07-29: Container widened to `max-w-7xl` with `px-5 sm:px-8`. At Rashid's
  ~1280px viewport the old `max-w-6xl` left a thin strip of dead margin.
- 2026-07-29: The application Zod schema lives in
  `src/lib/schemas/application.ts`, deliberately separate from the component,
  because Step 3's Edge Function will import the same file and re-validate
  server-side. Client validation is convenience; the server is the boundary.
- 2026-07-29: **Form is not wired to a database.** Submitting validates and
  shows a success panel that says so explicitly. It must keep saying so until
  Step 3 lands — a success message for an application nobody received would be
  a lie to a real creator.
- 2026-07-29: Landing page weight noted at ~182 KB gzip JS/CSS + ~102 KB fonts.
  The single biggest item is Zod at roughly 60 KB gzip inside the ApplyForm
  chunk. Not acted on yet. Fix at Step 3, when the schema is final: either
  switch to `zod/mini` or dynamic-import the schema so it is off the landing
  page's critical path.
- 2026-07-28: Content-Security-Policy deferred. The anti-flash theme script is
  inline and Motion injects inline styles, so a correct CSP needs script hashes
  and careful testing. Other security headers (HSTS, nosniff, frame-deny,
  referrer, permissions policy) ship now in `vercel.json`. **Revisit before the
  first prod launch.**
- 2026-07-28: Flagged to Rashid but not acted on — (a) a Vite SPA has no
  server-rendering, so the public landing page will be weak for SEO and link
  previews until we add a build-time prerender; (b) the Supabase free tier
  pauses inactive projects and has no daily backups, so prod needs a paid plan
  before real creators use it.
