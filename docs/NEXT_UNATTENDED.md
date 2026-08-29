# The Monday cutover: what is done, and what needs a person

**Updated 2026-08-29 ~04:00, at the end of the unattended run.** Everything
below is on the branch `fix/wurxbase-write-safety`, dev only. Nothing has been
merged to `dev`, nothing deployed, production untouched.

## Done overnight

**The data is current.** Copied from their idle project: creators 1249 -> 1258,
activity_logs 2348 -> 2376, brand_monthly_budgets 38 -> 44, sequences moved.
Their project is quiet over the weekend, so this stays current until Monday.

**All six data-loss bugs are fixed**, and by a database constraint rather than
the JavaScript compare-and-swap that was designed — see PARKED 34 and
DECISIONS. `pnpm verify:write-safety` proves the sequence that used to lose
data now loses nothing.

**The permission leak is closed.** `wurxbase.app_users.hub_email` joins a
person to the account they sign in with, and `useWurxbaseIdentity` reads the
role and overrides Asad maintains. `pnpm verify:wurxbase-perms` links a real
VIEWER row to an ADMIN of ours and proves they arrive as a viewer, with four
tabs and no Discovery.

**Two guards were repaired**, both of which had been passing by not looking:
the contrast guard could not parse `color(srgb ...)`, which is what Chromium
returns for `color-mix` — so every colour-mix background was read as absent
and elements were measured against the wrong thing. It reads both forms now and
FAILS on a colour it cannot parse. That immediately found 67 faded-ink
declarations, now solid.

Suites: write-safety 11/11, perms 4/4, signin 7/7, wurxbase 6/6, contrast 12/12,
collab-ads 30/30, collab-ads-ui 15/15.

---

## WHAT NEEDS A PERSON, before Monday

### 1 and 2. DONE ON DEV 2026-08-29

Rashid gave the pattern — *"for all this is the actually email :
[name]@wurxmedia.com"* — and the shared password. On dev:

- **All eight rows are linked.** `pnpm wurxbase:link` sets them and prints
  the table; safe to re-run, and it refuses if somebody has been added to
  their team who is not in its list.
- **All eight hub accounts exist**, every one of them `ops`. Asad does not
  need our `admin`: his own row carries superadmin and the row wins.
- **Proved by signing in as them.** `pnpm verify:wurxbase-roster` (needs
  `ROSTER_PASSWORD`) signs in as the superadmin, an ipc and a viewer: 21
  checks. Asad gets six tabs and the settings gear, Farkhan six tabs, Fahad
  four tabs and no gear.

**Both of these were put to Rashid and both are settled:**

1. **Their team seeing our whole admin panel is intended.** *"it's fien let
   them see all no issue"*, 2026-08-29. No narrower role is wanted.
2. **The password is `1234567890`** for all eight — `1-0` was a typo. Shared
   rather than per-person; worth offering once at the prod cutover, not worth
   raising twice.
### 3. Production

Untouched, and a human decision. Prod has no `wurxbase` schema and prod's code
still points at their old project, so it works the old way today. The cutover:

1. merge `fix/wurxbase-write-safety` into `dev`, look at it, then to `main`;
2. apply all four migrations to prod;
3. expose the `wurxbase` schema in the prod project's API settings — NOT in
   git, see OPERATIONS;
4. `SUPABASE_SERVICE_KEY=... node scripts/wurxbase-copy-data.mjs --i-mean-prod`;
5. move the three identity sequences the script prints;
6. `pnpm verify:wurxbase` against prod;
7. `SUPABASE_SERVICE_KEY=... node scripts/link-wurxbase-team.mjs --i-mean-prod`;
8. create the eight hub accounts there too — they do not travel with a
   migration — then `ROSTER_PASSWORD=... pnpm verify:wurxbase-roster`.

### 4. Somebody has to tell the team to stop using the old app

If both are live on Monday the data splits again, and this time nobody is
watching for it. Their old project is still reachable and still accepts writes.

### 5. Answered on 2026-08-29

- **`wurxbase.app_users.password`** — dropped, on his yes. So are the five
  hardcoded in the bundle and the dead login code that wrote them. The five
  remain in git history; treat them as burned.
- **The 30 unverified theme leads** — done, on his yes. The guard had been
  passing them by applying the large-text contrast floor to small text. 30
  real failures, all fixed, 12/12 on per-size floors. PARKED 35 closed.
- **Telling Asad** about the bugs in his own copy — still owed, he asked to
  be reminded later. Add the burned passwords to that conversation.

### 6. Fixed on 2026-08-29, found by looking

- **Settings was unreachable in our chrome**, and with it User Management,
  Access Control and God Mode. A gear beside the bell opens it now.
- **Two Sign out buttons** inside Paid Collabs stranded the person on a blank
  screen while still signed in. Removed.
- **The Team screen now edits hub emails**, which is where the eight
  addresses can be typed without a migration.
