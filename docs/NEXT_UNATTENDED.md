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

### 1. Eight email addresses — the blocker

`wurxbase.app_users.hub_email` ships EMPTY. Until it is filled in, everyone
falls back to the derived mapping, which makes any `ops` account their
`admin`. Fahad and Lead are viewers.

| WurxBase id | display | role | needs |
| --- | --- | --- | --- |
| asad | Asad | superadmin | their WurxMediaHub email |
| usman | Usman | admin | " |
| farkhan_ipc | Farkhan Saleem | ipc | " |
| khushi | khushi | ipc | " |
| masifa | masifa | ipc | " |
| shumyle_ipc | Shumyle Asim | ipc | " |
| fahad | Fahad | viewer | " |
| lead | Lead | viewer | " |

```sql
update wurxbase.app_users set hub_email = 'someone@wurxmedia.com' where id = 'asad';
```

**Do not guess these.** Matching the wrong human to a row hands somebody else's
permissions to the wrong person, which is the thing this column exists to stop.

### 2. Eight WurxMediaHub accounts

None of them has one. Identity comes from our auth now, so without an account
they cannot get in at all on Monday. `ops` is right for everyone except Asad;
the WurxBase row decides what they can do once inside.

```bash
node scripts/create-admin.mjs someone@wurxmedia.com "<a password>" ops
```

### 3. Production

Untouched, and a human decision. Prod has no `wurxbase` schema and prod's code
still points at their old project, so it works the old way today. The cutover:

1. merge `fix/wurxbase-write-safety` into `dev`, look at it, then to `main`;
2. apply all four migrations to prod;
3. expose the `wurxbase` schema in the prod project's API settings — NOT in
   git, see OPERATIONS;
4. `SUPABASE_SERVICE_KEY=... node scripts/wurxbase-copy-data.mjs --i-mean-prod`;
5. move the three identity sequences the script prints;
6. `pnpm verify:wurxbase` against prod.

### 4. Somebody has to tell the team to stop using the old app

If both are live on Monday the data splits again, and this time nobody is
watching for it. Their old project is still reachable and still accepts writes.

### 5. Still unanswered

- **`wurxbase.app_users.password`** — eight plaintext passwords, read by
  nothing since their login was removed. Offered twice; dropping a column is not
  an unattended act.
- **The 30 unverified theme leads** in PARKED 35. Rashid stopped that review to
  save budget and said he would say when to run it.
- **Telling Asad** about the bugs that were in his own copy. He asked to be
  reminded later.
