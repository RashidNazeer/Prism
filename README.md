# WurxMediaHub

The creator platform behind Wurx Media's TikTok Shop brands.

Creators apply once, get approved, and enter branded **Brand Hubs** where they
see their real numbers — GMV, commission earned, and the ad spend sitting behind
their own videos — alongside leaderboards, contests, briefs and retainer offers.

Transparency is the product.

## Status

Private, pre-launch. Phase 1, Step 0 (setup). See
[`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) for exactly where things stand.

## Stack

React 19 · Vite · TypeScript (strict) · Tailwind v4 · TanStack Query ·
React Router · Motion · Zod · Supabase (Postgres, Auth, RLS, Realtime, Edge
Functions) · Vercel · pnpm

## Getting started

```bash
pnpm install
cp .env.example .env.local     # then fill in the dev Supabase URL + anon key
pnpm dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local dev server |
| `pnpm build` | Design-token guard, then typecheck, then production build |
| `pnpm typecheck` | TypeScript only |
| `pnpm lint` | oxlint |
| `pnpm format` | Prettier write |
| `pnpm check:contrast` | Dark/light token parity + WCAG AA check |

`pnpm build` deliberately fails if a colour token exists in one theme but not
the other, or if any text/background pair drops below WCAG AA. Dark and light
mode are not allowed to drift apart.

## Environments

| Branch | URL | Database |
| --- | --- | --- |
| `dev` | wurxmediahubdev.vercel.app | `wurxmediahub-dev` |
| `main` | wurxmediahub.vercel.app | `wurxmediahub-prod` |

All day-to-day work happens on `dev`. `main` only moves on an explicit
instruction from the product owner.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — conventions, security rules, auth rules, working protocol
- [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — current step, what's done, what's next
- [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) — how features depend on each other
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — dated decisions and why

---

© Wurx Media. All rights reserved.
