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
- 2026-07-28: Playwright added as a dev dependency. Rashid cannot debug in a
  console, so "zero console errors" has to be machine-verified; section 11's
  auth-stability tests (idle refresh, two tabs, refresh mid-form) will need it
  too.
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
