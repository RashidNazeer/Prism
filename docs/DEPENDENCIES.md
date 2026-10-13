# Dependencies

What this project needs, what each thing is for, and what is deliberately not
here. Written 2026-10-13. Companion to `docs/NEW_MACHINE.md`, which covers
setting a machine up; this file covers what gets installed and why.

**The stack is locked.** Adding, removing or swapping anything in sections 2 or
3 needs Rashid's approval. That rule exists because the alternative is a
dependency list nobody can account for, on a product that handles people's
money.

---

## 1. System tools, installed outside the project

| Tool                  | Version in use       | Notes                                              |
| --------------------- | -------------------- | -------------------------------------------------- |
| Node.js               | `v24.20.0`           | any v24 LTS is fine                                |
| pnpm                  | `11.17.0`            | pinned by `packageManager` in package.json         |
| Git                   | `2.55.0`             |                                                    |
| Supabase CLI          | `2.119.0`            | migrations, Edge Function deploys, type generation |
| Chromium (Playwright) | installed separately | see below                                          |

```powershell
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install
pnpm exec playwright install chromium
```

**That last line is not optional.** `pnpm install` fetches the Playwright
library but not the browser binary. Skip it and every verification script fails
with a launch error that does not say "you forgot to install a browser".

The lockfile is `pnpm-lock.yaml`, lockfileVersion 9.0. The 29 packages declared
below resolve to **128** in total, counted from `node_modules/.pnpm` rather than
by reading the lockfile, which is easy to miscount. Install with
`--frozen-lockfile` in CI and on Vercel, which `vercel.json` already does.

---

## 2. Runtime dependencies (15)

These ship to the browser.

### The framework

| Package        | Version   | What it is for                       |
| -------------- | --------- | ------------------------------------ |
| `react`        | `^19.2.7` |                                      |
| `react-dom`    | `^19.2.7` |                                      |
| `react-router` | `^8.3.0`  | routing, with every route code-split |

### Data and validation

| Package                 | Version    | What it is for                                                                                                                                                                                  |
| ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@supabase/supabase-js` | `^2.110.9` | the database, auth, realtime and storage client. **Exactly one instance exists**, created in `src/lib/supabase.ts`. Never construct another; two clients means two sessions and random logouts. |
| `@tanstack/react-query` | `^5.101.4` | all server state. There is no other state library and none is wanted.                                                                                                                           |
| `zod`                   | `^4.4.3`   | validates every input, on the client **and** again inside the Edge Function. Client-side validation is a courtesy, not a boundary.                                                              |

### Interface

| Package                    | Version    | What it is for                                                                                                                                           |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `motion`                   | `^12.42.2` | animation. Runs under `LazyMotion` in **strict** mode: use `m.div`, never `motion.div`, which throws at runtime. Hooks like `useScroll` import normally. |
| `lucide-react`             | `^1.27.0`  | icons                                                                                                                                                    |
| `class-variance-authority` | `^0.7.1`   | typed component variants, used by `Button` and friends                                                                                                   |
| `clsx`                     | `^2.1.1`   | conditional class names                                                                                                                                  |
| `tailwind-merge`           | `^3.6.0`   | resolves conflicting Tailwind classes. Both are wrapped by `cn()` in `src/lib/utils.ts`; call that rather than either directly.                          |

### Document generation — and these four are a problem

| Package           | Version   | Used by                                                                    |
| ----------------- | --------- | -------------------------------------------------------------------------- |
| `jspdf`           | `^4.2.1`  | `src/routes/admin/contract-paper.js`, `src/vendor/wurxbase/contractPdf.js` |
| `jspdf-autotable` | `^5.0.8`  | `src/vendor/wurxbase/App.jsx`                                              |
| `xlsx`            | `^0.18.5` | `src/vendor/wurxbase/App.jsx`, `src/routes/admin/PaidCollabs.tsx`          |
| `pptxgenjs`       | `^4.0.1`  | `src/vendor/wurxbase/App.jsx`, `src/routes/admin/PaidCollabs.tsx`          |

**Every one of these is admin-only**, and they are heavy. They are a large part
of why `App-*.js` builds to **1,055 kB raw / 303 kB gzipped** — a bundle every
creator downloads on a phone to reach a screen none of them can open. Splitting
the admin side out of the creator path is the biggest outstanding performance
job on this project. It is listed as open in `docs/NEW_MACHINE.md` section 6.

Nothing here is wrong with the libraries themselves; the fault is where they are
loaded.

---

## 3. Development dependencies (14)

| Package                          | Version    | What it is for                                                                                      |
| -------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `vite`                           | `^8.1.1`   | build and dev server                                                                                |
| `@vitejs/plugin-react`           | `^6.0.3`   |                                                                                                     |
| `typescript`                     | `~6.0.2`   | strict, with `noUncheckedIndexedAccess`. `arr[i]` is `T \| undefined` and the compiler will say so. |
| `tailwindcss`                    | `^4.3.3`   | v4, configured in CSS rather than a JS config file                                                  |
| `@tailwindcss/vite`              | `^4.3.3`   |                                                                                                     |
| `postcss`                        | `^8.5.26`  |                                                                                                     |
| `oxlint`                         | `^1.71.0`  | linting. Fast; the warnings it reports in `src/vendor/` are pre-existing and expected.              |
| `prettier`                       | `^3.9.6`   | formatting                                                                                          |
| `prettier-plugin-tailwindcss`    | `^0.8.1`   | sorts class names so diffs stay readable                                                            |
| `playwright`                     | `^1.62.0`  | drives real Chromium for every verification script                                                  |
| `@tanstack/react-query-devtools` | `^5.101.4` |                                                                                                     |
| `@types/node`                    | `^24.13.2` |                                                                                                     |
| `@types/react`                   | `^19.2.17` |                                                                                                     |
| `@types/react-dom`               | `^19.2.3`  |                                                                                                     |

---

## 4. Edge Functions run on Deno, not Node

The 21 functions under `supabase/functions/` do **not** use `package.json` at
all. Deno resolves their imports directly, and across all of them there are only
two:

```
npm:@supabase/supabase-js
npm:zod
```

So a function's dependencies cannot be installed or audited by `pnpm`. Deploy
with the Supabase CLI:

```powershell
supabase functions deploy <name> --project-ref npznoiotslruqovorrec
```

Service-role keys live in Edge Function secrets and nowhere else. They never
appear in `.env`, never in the browser bundle, and never on disk.

---

## 5. Things that are in the repository but are not packages

**`src/vendor/wurxbase/` — 13 vendored files.** The Paid Collabs admin app,
copied in rather than installed. `scripts/check-isolation.mjs` counts these and
fails the build if the number changes unexpectedly. Our additions to those files
are fenced `WURX-ADDED ... WURX-END` and re-applied by
`scripts/wurxbase-patches.mjs` after a new copy is pulled in, so the vendored
code is always "theirs, plus exactly these blocks".

**Fonts.** Caprasimo and Figtree are self-hosted in `public/fonts/` as `.woff2`,
preloaded in `index.html`. No Google Fonts request at runtime: no third party,
no render-blocking round trip.

**Icons and the manifest.** `public/icons/`, `public/manifest.webmanifest` and
`public/sw.js` are hand-written and hand-rendered. No PWA plugin.

---

## 6. What is deliberately NOT here

Worth knowing before you reach for one of these, because the absence is a
decision rather than an oversight.

| Not used                                      | Why                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js**                                   | Explicitly excluded by `CLAUDE.md`. This is a Vite SPA.                                                                                                                                                       |
| **Any ORM**                                   | Queries go through `supabase-js` against a schema that RLS protects. An ORM would add a second opinion about access.                                                                                          |
| **Redux / Zustand / Jotai**                   | TanStack Query holds server state; React holds the rest. Adding a state library is how the session ends up duplicated.                                                                                        |
| **A charting library**                        | Every chart is inline SVG. A dependency for two charts is a poor trade, and this way the marks obey the same `--wx-*` tokens and the same user text-size setting as everything else. See `VelocityChart.tsx`. |
| **An image library** (`sharp`, `jimp`)        | The app icons are rendered by Chromium through Playwright, which is already installed. The source is an SVG, so a real renderer was the right tool anyway.                                                    |
| **A PWA plugin** (`vite-plugin-pwa`, Workbox) | The manifest is 40 lines and the service worker is deliberately almost inert. A plugin would have precached the 1 MB admin bundle by default, which is the exact opposite of what this app needs.             |
| **A component library beyond shadcn/ui**      | shadcn is copied in and themed, not installed.                                                                                                                                                                |
| **A test runner**                             | There is no unit test suite. Verification is done by the 125 scripts in `scripts/`, which drive a real browser and a real database. That is a real gap, not a claim that tests are unnecessary.               |

---

## 7. Keeping it honest

- `pnpm build` runs the token guards, `tsc` and the Vite build. It must pass
  before any commit.
- `scripts/check-isolation.mjs` proves there is one Supabase client, one schema
  and the expected count of vendored files. It runs inside the build.
- Adding a dependency means updating this file in the same commit, with what it
  is for and whether it reaches the creator bundle. A list that drifts is worse
  than no list, because people trust it.
