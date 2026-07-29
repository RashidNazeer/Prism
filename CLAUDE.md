# WurxMediaHub, agent working notes

Creator platform for Wurx Media's TikTok Shop brands. Creators apply once, get
approved, and enter branded **Brand Hubs** where they see their real numbers
(GMV, commission, ad spend behind their own videos), leaderboards, contests,
briefs and retainer offers. Admins manage brands, campaigns, users and data.

**Transparency is the product.** The moment that matters: a creator logs in and
sees their real GMV.

Owner: Rashid (product owner, tests everything in the browser, does not use Git
or the terminal). Claude runs the entire toolchain via CLI.

## Read this first, every session

1. `docs/PROJECT_STATE.md`, where we are, what's next. **Always.**
2. `docs/PARKED.md`, work we deliberately deferred. **Always.** Each item names
   the trigger that should bring it back up. Raise it yourself when that trigger
   arrives rather than waiting to be asked. When Rashid asks "what's pending?",
   answer from this file.
3. `docs/FEATURE_MAP.md`, only the entries you are about to touch.
4. `docs/DECISIONS.md`, only when a decision is in question.

Chunked memory, not everything at once. If reality and the docs disagree, fix
the docs in the same commit.

## Stack (locked, change only with Rashid's approval)

React 19 + Vite + TypeScript strict · Tailwind v4 + shadcn/ui (heavily themed) ·
TanStack Query for all server state · React Router (code-split routes) ·
Motion for animation · Zod on every input · Supabase (Postgres, Auth, RLS,
Realtime, Storage, Edge Functions) · Vercel hosting · pnpm.

No Next.js. No ORM. No state library beyond TanStack Query.

## Commands

```bash
pnpm dev              # local dev server
pnpm build            # token guard + tsc + vite build  (must pass before commit)
pnpm typecheck        # tsc -b
pnpm lint             # oxlint
pnpm format           # prettier --write
pnpm check:contrast   # dark/light token parity + WCAG guard
pnpm verify:browser   # real Chromium: console errors, both themes, responsive
```

`verify:browser` needs a server running, `pnpm build` then `pnpm preview` in
another shell, then point it at http://localhost:4173. Rashid cannot read a
console, so this is how "zero console errors" gets proven.

Supabase (always pass the token via env, never `supabase login`):

```bash
supabase migration new <name>     # create a migration file
supabase db push                  # apply migrations to the linked project
supabase gen types typescript --linked > src/types/database.ts
```

## Layout

```
src/
  app/        providers.tsx, router.tsx      # mounted once, never keyed on session
  components/ brand/ layout/ theme/ ui/
  lib/        supabase.ts env.ts query-client.ts utils.ts
  routes/     one file per screen, lazy-loaded
  styles/     tokens.css (all colour lives here) global.css
scripts/      check-contrast.mjs             # runs inside pnpm build
supabase/     migrations/                    # every schema change, committed
docs/         PROJECT_STATE.md FEATURE_MAP.md DECISIONS.md
```

## Step protocol

One roadmap step per approval. Never build two steps at once.

Read state → plan in 5-10 lines → build → report in plain English with a
click-by-click test checklist → **stop** and wait for "approved" / "next".
A bug report becomes the current step.

Definition of done: `pnpm build` passes · zero console errors · RLS verified on
any new table · docs updated in the same commit · pushed · deployed to dev.

Never force-push, drop tables, reset a database, or delete a project without
asking. On prod, ask twice.

## Security rules (non-negotiable)

- RLS on every table from creation, deny by default. No table ships without
  policies. The `automatic RLS` event trigger is enabled on both projects.
- `Automatically expose new tables` is OFF, grants are explicit, per table, in
  the migration.
- Never trust a role, tier or `creator_id` from the client. Derive identity from
  `auth.uid()` and JWT claims (custom access token hook).
- Browser bundle may contain only the Supabase URL and anon key. Service-role
  keys live only in Edge Function secrets.
- Privileged actions (approvals, tier changes, brand edits, data upload, money)
  go through Edge Functions that re-check the caller's role server-side.
- Zod on the client *and* again in the Edge Function. Audit sensitive admin
  actions to `audit_log`.
- Hiding a button is never the security boundary. The database is.

## Auth rules (we are engineering against random logouts)

- Exactly one Supabase client, from `src/lib/supabase.ts`. Never construct one
  in a component, hook or route.
- `persistSession` + `autoRefreshToken` + PKCE, default token lifetimes.
- `onAuthStateChange` may only set state. Never reload or navigate on
  `TOKEN_REFRESHED` / `USER_UPDATED`. Redirect only on real sign-in/sign-out.
- Nothing in the provider tree may be keyed on the session, a token refresh
  must not remount React or wipe a half-filled form.

## Design rules

- **Every colour is a `var(--wx-*)` token in `src/styles/tokens.css`.** No
  hardcoded hex in components, ever.
- Dark and light are equal citizens. A token added to one mode MUST be added to
  the other, `pnpm check:contrast` enforces parity and WCAG AA in both and
  fails the build otherwise.
- Palette from wurxmedia.com: near-black `#0a0a0a`, gold `#c8924b`, cream
  `#f5efe1`. Light mode darkens the gold to `#8a5f1f` for readability.
- Fonts: Archivo Black (display), Inter (UI), JetBrains Mono (numbers/labels).
- Brand Hub theming overrides `--wx-*` at the hub level from the database, so a
  hub feels like the brand, not like Wurx.
- Skeletons, never bare spinners. Designed empty and error states. Mobile first.

## Performance habits (from step 1, not "later")

Server-side pagination on every growable list. Never `select('*')` on wide
tables. Index every FK and every common filter/sort. Aggregate in SQL, not in
the browser. Route-level code splitting. Sensible `staleTime` per resource.

## Environments

`dev` branch → wurxmediahubdev.vercel.app → Supabase `wurxmediahub-dev`
`main` branch → wurxmediahub.vercel.app → Supabase `wurxmediahub-prod`

All work happens on `dev`. Prod changes only when Rashid says "make it live".
Dev may hold seed data. Prod never gets test data.
