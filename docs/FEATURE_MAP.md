# Feature map

**Why this file exists.** Bugs happen when a new feature silently depends on an
old one. Delete a creator, and their campaigns must vanish from the campaigns
screen too. Add a user, and the team view must show them. This file is the
written record of those links so nothing drifts.

**Rules**

- Before touching any schema or shared logic: read the entries below for
  everything involved, and list the affected features in the step plan.
- After adding any feature: add its entry AND update every entry it touches, in
  the same commit as the code.
- A feature without an entry here is not done.

Structure carries the load first — foreign keys with a consciously chosen
`ON DELETE`, constraints, and shared SQL views so every screen reads the same
truth. This map is the second layer, not the only one.

---

## Design tokens & theming

**Files:** `src/styles/tokens.css`, `src/styles/global.css`,
`scripts/check-contrast.mjs`, `src/components/theme/*`
**Tables:** none yet. Brand Hub theming (Step 6) will add `brands.theme` and
override `--wx-*` at the hub level.

**Depended on by:** every visual surface in the product.

**Change rules**

- Every colour in the app is a `var(--wx-*)` token. No hardcoded hex in
  components — that is what breaks light mode.
- A token added to `[data-theme='dark']` MUST also be added to
  `[data-theme='light']` and vice versa. `pnpm build` fails otherwise.
- Adding a new text/background combination means adding it to the `PAIRS` list
  in `scripts/check-contrast.mjs` so it is contrast-checked in both themes.
- The anti-flash script in `index.html` duplicates the theme-resolution logic in
  `ThemeProvider.tsx`. Change one, change the other — same storage key
  (`wurxmediahub-theme`), same fallback.

## Routing & shell

**Files:** `src/app/router.tsx`, `src/app/providers.tsx`, `src/main.tsx`,
`src/components/layout/RouteFallback.tsx`

**Depended on by:** every screen.

**Change rules**

- Every route is lazy (`lazy: async () => ...`) so screens ship as separate
  chunks. A new route without lazy loading is a regression.
- Every route gets `HydrateFallback: RouteFallback` — skeleton, never a spinner.
- `Providers` mounts once per tab. Nothing inside it may take a `key` derived
  from the session, user id, or access token. See CLAUDE.md "Auth rules".

## Supabase client & environment

**Files:** `src/lib/supabase.ts`, `src/lib/env.ts`, `.env.example`
**Tables:** none yet.

**Depended on by:** everything that reads or writes data (from Step 1 onward).

**Change rules**

- There is exactly one Supabase client, created lazily by `getSupabase()`.
  Never call `createClient` anywhere else — two clients race on the refresh
  token and log users out at random.
- Any new browser env var must be added to the Zod schema in `env.ts`, to
  `.env.example`, AND to both Vercel projects. Missing one of the three is the
  usual cause of "works locally, blank on dev".
- Only `VITE_`-prefixed public values belong in `env.ts`. Secrets go to Edge
  Function secrets.

## Brand mark

**Files:** `src/components/brand/WurxMark.tsx`, `public/favicon.svg`

**Change rules**

- Currently a placeholder. Every usage goes through `<WurxMark />`, so replacing
  the real logo is a one-file change — plus `public/favicon.svg`, which is a
  hand-copy of the same shape and must be updated with it.

---

## Not built yet

These get entries as they are built. Listed so the dependency shape is visible
early.

| Feature | Arrives | Will depend on | Will be depended on by |
| --- | --- | --- | --- |
| Auth, profiles, roles, tiers | Step 1 | Supabase client | everything |
| Landing page | Step 2 | Design tokens | Applications |
| Applications | Step 3 | Auth, profiles | Admin review |
| Admin review | Step 4 | Applications, roles | Creators, Realtime |
| Home | Step 5 | Facts, brands, announcements | — |
| Brand Hubs + theming | Step 6 | Brands, design tokens | My Numbers, Leaderboards |
| Data pipeline + facts | Step 7 | Creators, brands, identity map | My Numbers, Leaderboards, Home |
| My Numbers | Step 8 | Facts, Brand Hubs | — |
| Leaderboards | Step 9 | Facts, privacy flag | Brand Hubs |
| Offers + Discord | Step 10 | Tiers, Brand Hubs | — |
